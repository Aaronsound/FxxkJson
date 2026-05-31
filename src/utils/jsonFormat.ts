import { jsonrepair } from 'jsonrepair';

const MAX_NESTED_JSON_STRING_DEPTH = 3;

export interface JsonFormatResult {
  formatted: string;
  normalizedNestedString: boolean;
}

export interface JsonRepairResult extends JsonFormatResult {
  repaired: string;
}

function looksLikeJsonContainer(text: string) {
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function looksLikeEscapedJsonContainer(text: string) {
  const trimmed = text.trim();
  return (
    ((trimmed.startsWith('{\\"') || trimmed.startsWith('{\\n')) && trimmed.endsWith('}')) ||
    ((trimmed.startsWith('[{\\"') || trimmed.startsWith('[\\n') || trimmed.startsWith('[\\"')) && trimmed.endsWith(']'))
  );
}

function parseNestedJsonString(value: unknown) {
  let parsed = value;
  let normalizedNestedString = false;

  for (let depth = 0; depth < MAX_NESTED_JSON_STRING_DEPTH; depth += 1) {
    if (typeof parsed !== 'string' || !looksLikeJsonContainer(parsed)) {
      break;
    }

    try {
      parsed = JSON.parse(parsed);
      normalizedNestedString = true;
    } catch {
      break;
    }
  }

  return {
    value: parsed,
    normalizedNestedString,
  };
}

export function parseJsonForFormatting(text: string) {
  try {
    return parseNestedJsonString(JSON.parse(text));
  } catch (error) {
    if (!looksLikeEscapedJsonContainer(text)) {
      throw error;
    }

    try {
      return parseNestedJsonString(JSON.parse(`"${text.trim()}"`));
    } catch {
      throw error;
    }
  }
}

export function formatJsonText(text: string): JsonFormatResult {
  const { value, normalizedNestedString } = parseJsonForFormatting(text);

  return {
    formatted: JSON.stringify(value, null, 2),
    normalizedNestedString,
  };
}

export function repairJsonText(text: string): JsonRepairResult {
  const repaired = jsonrepair(text);
  const { formatted, normalizedNestedString } = formatJsonText(repaired);

  return {
    repaired,
    formatted,
    normalizedNestedString,
  };
}
