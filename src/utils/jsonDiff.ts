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
}

const MAX_PREVIEW_LENGTH = 120;
const MAX_DIFFS = 2000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

  return text.length > MAX_PREVIEW_LENGTH
    ? `${text.slice(0, MAX_PREVIEW_LENGTH - 3)}...`
    : text;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right) {
    return false;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((item, index) => valuesEqual(item, right[index]));
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key)
        && valuesEqual(left[key], right[key]));
  }

  return false;
}

function addDiff(
  diffs: JsonDiffEntry[],
  type: JsonDiffType,
  path: Array<string | number>,
  left: unknown,
  right: unknown
) {
  if (diffs.length >= MAX_DIFFS) {
    return;
  }

  diffs.push({
    type,
    path,
    pathText: formatJsonPath(path),
    leftPreview: previewValue(left),
    rightPreview: previewValue(right),
  });
}

function compareValues(
  left: unknown,
  right: unknown,
  path: Array<string | number>,
  diffs: JsonDiffEntry[]
) {
  if (diffs.length >= MAX_DIFFS || valuesEqual(left, right)) {
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength && diffs.length < MAX_DIFFS; index += 1) {
      const childPath = [...path, index];
      if (index >= left.length) {
        addDiff(diffs, 'added', childPath, undefined, right[index]);
      } else if (index >= right.length) {
        addDiff(diffs, 'removed', childPath, left[index], undefined);
      } else {
        compareValues(left[index], right[index], childPath, diffs);
      }
    }
    return;
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    for (const key of keys) {
      if (diffs.length >= MAX_DIFFS) {
        return;
      }

      const childPath = [...path, key];
      const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
      const hasRight = Object.prototype.hasOwnProperty.call(right, key);
      if (!hasLeft) {
        addDiff(diffs, 'added', childPath, undefined, right[key]);
      } else if (!hasRight) {
        addDiff(diffs, 'removed', childPath, left[key], undefined);
      } else {
        compareValues(left[key], right[key], childPath, diffs);
      }
    }
    return;
  }

  addDiff(diffs, 'changed', path, left, right);
}

function parseJson(text: string) {
  if (!text.trim()) {
    throw new Error('内容为空');
  }

  return JSON.parse(text);
}

export function compareJsonTexts(leftText: string, rightText: string): JsonDiffResult {
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
    return { diffs: [], leftError, rightError };
  }

  const diffs: JsonDiffEntry[] = [];
  compareValues(leftValue, rightValue, [], diffs);
  return { diffs, leftError: null, rightError: null };
}
