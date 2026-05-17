import type { JsonEditPath } from '../types/jsonTool';

export interface EditableNodePayload {
  path: JsonEditPath;
  value: string;
}

export function isJsonEditPath(value: unknown): value is JsonEditPath {
  return Array.isArray(value)
    && value.every((segment) => typeof segment === 'string' || typeof segment === 'number');
}

export function parseEditableNodePayload(
  payload: string,
  invalidMessage = '当前节点无法编辑'
): EditableNodePayload {
  const parsed = JSON.parse(payload) as { path?: unknown; value?: unknown };

  if (!isJsonEditPath(parsed.path) || typeof parsed.value !== 'string') {
    throw new Error(invalidMessage);
  }

  return {
    path: parsed.path,
    value: parsed.value,
  };
}
