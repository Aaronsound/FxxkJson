import type { JsonEditPath } from '../types/jsonTool';

export interface EditableNodePayload {
  path: JsonEditPath;
  value: string;
}

export type JsonNodeValueKind = 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object';

export interface EditableNodeDetails extends EditableNodePayload {
  clipboardValue: string;
  compactJson: string;
  formattedJson: string;
  kind: JsonNodeValueKind;
  parsedValue: unknown;
}

export function isJsonEditPath(value: unknown): value is JsonEditPath {
  return Array.isArray(value) && value.every((segment) => typeof segment === 'string' || typeof segment === 'number');
}

export function parseEditableNodePayload(payload: string, invalidMessage = '当前节点无法编辑'): EditableNodePayload {
  const parsed = JSON.parse(payload) as { path?: unknown; value?: unknown };

  if (!isJsonEditPath(parsed.path) || typeof parsed.value !== 'string') {
    throw new Error(invalidMessage);
  }

  return {
    path: parsed.path,
    value: parsed.value,
  };
}

export function getJsonValueKind(value: unknown): JsonNodeValueKind {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return valueType;
  }

  return 'object';
}

export function getJsonLiteralDetails(jsonLiteral: string): Omit<EditableNodeDetails, 'path' | 'value'> {
  const parsedValue = JSON.parse(jsonLiteral);
  const kind = getJsonValueKind(parsedValue);
  return {
    clipboardValue: kind === 'string' ? (parsedValue as string) : jsonLiteral,
    compactJson: JSON.stringify(parsedValue),
    formattedJson: JSON.stringify(parsedValue, null, 2),
    kind,
    parsedValue,
  };
}

export function parseEditableNodeDetails(payload: string, invalidMessage = '当前节点无法编辑'): EditableNodeDetails {
  const node = parseEditableNodePayload(payload, invalidMessage);
  return {
    ...node,
    ...getJsonLiteralDetails(node.value),
  };
}
