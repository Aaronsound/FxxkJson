export interface JsonEscapeTransformResult {
  text: string;
  formattedJson: boolean;
}

function classifyDecodedText(text: string): JsonEscapeTransformResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      text,
      formattedJson: false,
    };
  }

  try {
    JSON.parse(trimmed);
    return {
      text,
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
  return classifyDecodedText(unescapeJsonStringLiteral(text));
}

export function unescapeJsonStringLiteral(text: string) {
  const decoded = decodeEscapedText(text);
  if (decoded === null) {
    throw new Error('当前内容不是可反转义的 JSON 字符串');
  }

  return decoded;
}

export function escapeJsonStringLiteral(text: string) {
  if (!text.trim()) {
    throw new Error('没有可转义的内容');
  }

  return JSON.stringify(text);
}

export function escapeJsonText(text: string): JsonEscapeTransformResult {
  const escapedText = escapeJsonStringLiteral(text);
  const trimmed = text.trim();

  try {
    JSON.parse(trimmed);
    return {
      text: escapedText,
      formattedJson: true,
    };
  } catch {
    return {
      text: escapedText,
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
