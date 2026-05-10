import type { JsonEditPath } from '../types/jsonTool';

const IDENTIFIER_KEY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function escapeBracketKey(key: string) {
  return key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function formatJsonPath(path: JsonEditPath) {
  if (path.length === 0) {
    return '$';
  }

  return path.reduce((current, segment) => {
    if (typeof segment === 'number') {
      return `${current}[${segment}]`;
    }

    if (IDENTIFIER_KEY_PATTERN.test(segment)) {
      return `${current}.${segment}`;
    }

    return `${current}["${escapeBracketKey(segment)}"]`;
  }, '$');
}
