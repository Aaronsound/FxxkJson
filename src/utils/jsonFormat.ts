import { jsonrepair } from 'jsonrepair';
import { layoutJsonTokens } from './losslessJson';

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

export function formatJsonText(text: string): JsonFormatResult {
  let source = text;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    if (!looksLikeEscapedJsonContainer(text)) throw error;
    try {
      source = JSON.parse(`"${text.trim()}"`) as string;
      value = JSON.parse(source);
    } catch {
      throw error;
    }
  }
  let normalizedNestedString = source !== text;
  for (let depth = 0; depth < MAX_NESTED_JSON_STRING_DEPTH; depth += 1) {
    if (typeof value !== 'string' || !looksLikeJsonContainer(value)) break;
    try {
      const nested: unknown = JSON.parse(value);
      source = value;
      value = nested;
      normalizedNestedString = true;
    } catch {
      break;
    }
  }

  return {
    formatted: layoutJsonTokens(source),
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
