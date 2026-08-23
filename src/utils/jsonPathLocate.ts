import { visit } from 'jsonc-parser';
import type { JsonEditPath } from '../types/jsonTool';
import type { LocateRange } from './lightweightLocate';

function arePathsEqual(left: JsonEditPath, right: JsonEditPath) {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function isPathPrefix(prefix: JsonEditPath, path: JsonEditPath) {
  return prefix.length <= path.length && prefix.every((segment, index) => segment === path[index]);
}

export function getJsonPathLocateRange(text: string, path: JsonEditPath): LocateRange | null {
  if (!text) {
    return null;
  }

  let range: LocateRange | null = null;
  let targetContainer: { kind: 'array' | 'object'; startOffset: number } | null = null;

  const beginContainer = (kind: 'array' | 'object', offset: number, pathSupplier: () => Array<string | number>) => {
    if (range) {
      return false;
    }

    const currentPath = pathSupplier();
    if (arePathsEqual(currentPath, path)) {
      targetContainer = { kind, startOffset: offset };
      return false;
    }

    return isPathPrefix(currentPath, path);
  };

  const endContainer = (kind: 'array' | 'object', offset: number, length: number) => {
    if (!range && targetContainer?.kind === kind) {
      range = {
        startOffset: targetContainer.startOffset,
        endOffset: offset + length,
      };
      targetContainer = null;
    }
  };

  visit(text, {
    onArrayBegin(offset, _length, _line, _character, pathSupplier) {
      return beginContainer('array', offset, pathSupplier);
    },
    onArrayEnd(offset, length) {
      endContainer('array', offset, length);
    },
    onLiteralValue(_value, offset, length, _line, _character, pathSupplier) {
      if (!range && arePathsEqual(pathSupplier(), path)) {
        range = { startOffset: offset, endOffset: offset + length };
      }
    },
    onObjectBegin(offset, _length, _line, _character, pathSupplier) {
      return beginContainer('object', offset, pathSupplier);
    },
    onObjectEnd(offset, length) {
      endContainer('object', offset, length);
    },
  });

  return range;
}
