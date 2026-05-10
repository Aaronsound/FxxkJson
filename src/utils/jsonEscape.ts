export interface JsonEscapeTransformResult {
  text: string;
  formattedJson: boolean;
}

function formatIfJson(text: string): JsonEscapeTransformResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      text,
      formattedJson: false,
    };
  }

  try {
    return {
      text: JSON.stringify(JSON.parse(trimmed), null, 2),
      formattedJson: true,
    };
  } catch {
    return {
      text,
      formattedJson: false,
    };
  }
}

function parseJsonStringLiteral(text: string) {
  try {
    const parsed = JSON.parse(text.trim());
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function parseBareEscapedString(text: string) {
  const trimmed = text.trim();
  if (!/\\["\\/bfnrtu]/.test(trimmed)) {
    return null;
  }

  try {
    return JSON.parse(`"${trimmed.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
  } catch {
    return null;
  }
}

function decodeEscapedText(text: string) {
  const literalValue = parseJsonStringLiteral(text);
  if (literalValue !== null) {
    return parseBareEscapedString(literalValue) ?? literalValue;
  }

  return parseBareEscapedString(text);
}

export function unescapeJsonText(text: string): JsonEscapeTransformResult {
  const decoded = decodeEscapedText(text);
  if (decoded === null) {
    throw new Error('当前内容不是可反转义的 JSON 字符串');
  }

  return formatIfJson(decoded);
}

export function escapeJsonText(text: string): JsonEscapeTransformResult {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('没有可转义的内容');
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      text: JSON.stringify(JSON.stringify(parsed)),
      formattedJson: true,
    };
  } catch {
    return {
      text: JSON.stringify(text),
      formattedJson: false,
    };
  }
}

export function looksLikeEscapedJson(text: string) {
  try {
    return unescapeJsonText(text).formattedJson;
  } catch {
    return false;
  }
}
