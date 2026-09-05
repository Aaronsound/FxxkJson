import { formatJsonPath } from './jsonPath';

export type JsonDiffType = 'added' | 'removed' | 'changed';

export interface JsonDiffEntry {
  type: JsonDiffType;
  path: Array<string | number>;
  pathText: string;
  leftPreview: string;
  rightPreview: string;
}

export interface JsonDiffResult {
  diffs: JsonDiffEntry[];
  leftError: string | null;
  rightError: string | null;
  truncated: boolean;
}

const MAX_PREVIEW_LENGTH = 120;
export const MAX_DIFFS = 2000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Equal documents do not need paths, previews, sorting or a resumable traversal.
function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && valuesEqual(left[key], right[key]))
    );
  }
  return false;
}

function previewValue(value: unknown) {
  if (typeof value === 'undefined') {
    return '';
  }

  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }

  if (typeof text !== 'string') {
    text = String(value);
  }

  return text.length > MAX_PREVIEW_LENGTH ? `${text.slice(0, MAX_PREVIEW_LENGTH - 3)}...` : text;
}

function makeDiff(type: JsonDiffType, path: Array<string | number>, left: unknown, right: unknown): JsonDiffEntry {
  return {
    type,
    path,
    pathText: formatJsonPath(path),
    leftPreview: previewValue(left),
    rightPreview: previewValue(right),
  };
}

function* compareValues(left: unknown, right: unknown, path: Array<string | number>): Generator<JsonDiffEntry> {
  if (Object.is(left, right)) {
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      const childPath = [...path, index];
      if (index >= left.length) {
        yield makeDiff('added', childPath, undefined, right[index]);
      } else if (index >= right.length) {
        yield makeDiff('removed', childPath, left[index], undefined);
      } else {
        yield* compareValues(left[index], right[index], childPath);
      }
    }
    return;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    for (const key of keys) {
      const childPath = [...path, key];
      const hasLeft = Object.hasOwn(left, key);
      const hasRight = Object.hasOwn(right, key);
      if (!hasLeft) {
        yield makeDiff('added', childPath, undefined, right[key]);
      } else if (!hasRight) {
        yield makeDiff('removed', childPath, left[key], undefined);
      } else {
        yield* compareValues(left[key], right[key], childPath);
      }
    }
    return;
  }

  yield makeDiff('changed', path, left, right);
}

function parseJson(text: string) {
  if (!text.trim()) {
    throw new Error('内容为空');
  }

  return JSON.parse(text);
}

// Parse once and retain a traversal cursor; subsequent batches never rescan earlier differences.
export function createJsonComparison(leftText: string, rightText: string): { next: () => JsonDiffResult } {
  let leftValue: unknown;
  let rightValue: unknown;
  let leftError: string | null = null;
  let rightError: string | null = null;

  try {
    leftValue = parseJson(leftText);
  } catch (error) {
    leftError = error instanceof Error ? error.message : '左侧 JSON 解析失败';
  }

  try {
    rightValue = parseJson(rightText);
  } catch (error) {
    rightError = error instanceof Error ? error.message : '右侧 JSON 解析失败';
  }

  if (leftError || rightError) {
    return { next: () => ({ diffs: [], leftError, rightError, truncated: false }) };
  }

  if (valuesEqual(leftValue, rightValue)) {
    return { next: () => ({ diffs: [], leftError: null, rightError: null, truncated: false }) };
  }

  const cursor = compareValues(leftValue, rightValue, []);
  let pending: IteratorResult<JsonDiffEntry> | undefined;
  return {
    next() {
      const diffs: JsonDiffEntry[] = [];
      pending ??= cursor.next();
      while (!pending.done && diffs.length < MAX_DIFFS) {
        diffs.push(pending.value);
        pending = cursor.next();
      }
      return { diffs, leftError: null, rightError: null, truncated: !pending.done };
    },
  };
}

export function compareJsonTexts(leftText: string, rightText: string): JsonDiffResult {
  return createJsonComparison(leftText, rightText).next();
}

export type JsonCompareWorkerRequest = { leftText: string; rightText: string } | { next: true };
export type JsonCompareWorkerResponse = { result: JsonDiffResult } | { error: string };
