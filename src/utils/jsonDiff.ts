import { formatJsonPath } from './jsonPath';
import {
  comparisonScalarsEqual,
  comparisonValueChunks,
  isComparisonObject,
  parseComparisonJson,
  serializeComparisonValue,
} from './jsonComparisonValues';

export type JsonDiffType = 'added' | 'removed' | 'changed';
export type JsonDiffSide = 'left' | 'right';
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
export interface JsonDiffValue {
  text: string;
  total: number;
  offset: number;
  missing: boolean;
}
const MAX_PREVIEW_LENGTH = 120;
export const MAX_DIFFS = 2000;
export const DIFF_VALUE_CHUNK_SIZE = 16384;

function previewValue(value: unknown) {
  let text = '';
  for (const chunk of comparisonValueChunks(value, MAX_PREVIEW_LENGTH + 1)) {
    text += chunk;
    if (text.length > MAX_PREVIEW_LENGTH) return `${text.slice(0, MAX_PREVIEW_LENGTH - 3)}...`;
  }
  return text;
}

interface PathLink {
  parent: PathLink | null;
  key: string | number;
}
function makePath(link: PathLink | null) {
  const path: Array<string | number> = [];
  for (; link; link = link.parent) path.push(link.key);
  return path.reverse();
}

function* compareValues(left: unknown, right: unknown): Generator<JsonDiffEntry> {
  type Frame = { left: unknown; right: unknown; path: PathLink | null; keys?: string[]; index?: number };
  const stack: Frame[] = [{ left, right, path: null }];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (frame.index === undefined) {
      if (comparisonScalarsEqual(frame.left, frame.right)) {
        stack.pop();
        continue;
      }
      const arrays = Array.isArray(frame.left) && Array.isArray(frame.right);
      const objects = isComparisonObject(frame.left) && isComparisonObject(frame.right);
      if (!arrays && !objects) {
        const path = makePath(frame.path);
        yield {
          type: 'changed',
          path,
          pathText: formatJsonPath(path),
          leftPreview: previewValue(frame.left),
          rightPreview: previewValue(frame.right),
        };
        stack.pop();
        continue;
      }
      frame.index = 0;
      if (objects)
        frame.keys = Array.from(
          new Set([...Object.keys(frame.left as object), ...Object.keys(frame.right as object)])
        ).sort();
    }
    const l = frame.left as Record<string | number, unknown> & { length: number };
    const r = frame.right as typeof l;
    const length = frame.keys ? frame.keys.length : Math.max(l.length, r.length);
    if (frame.index >= length) {
      stack.pop();
      continue;
    }
    const key = frame.keys ? frame.keys[frame.index] : frame.index;
    frame.index += 1;
    const hasLeft = Object.hasOwn(l, key);
    const hasRight = Object.hasOwn(r, key);
    // Equal leaves are common in large, nearly identical documents. Do not
    // allocate a traversal frame/path link for each unchanged primitive.
    if (hasLeft && hasRight && comparisonScalarsEqual(l[key], r[key])) continue;
    const pathLink = { parent: frame.path, key };
    if (!hasLeft || !hasRight) {
      const path = makePath(pathLink);
      yield {
        type: hasLeft ? 'removed' : 'added',
        path,
        pathText: formatJsonPath(path),
        leftPreview: previewValue(hasLeft ? l[key] : undefined),
        rightPreview: previewValue(hasRight ? r[key] : undefined),
      };
    } else stack.push({ left: l[key], right: r[key], path: pathLink });
  }
}

export function createJsonComparison(leftText: string, rightText: string) {
  let left: unknown;
  let right: unknown;
  let leftError: string | null = null;
  let rightError: string | null = null;
  const identicalText = leftText === rightText;
  let detailSource: string | null = identicalText ? leftText : null;
  try {
    left = identicalText ? JSON.parse(leftText) : parseComparisonJson(leftText);
  } catch (error) {
    leftError = error instanceof Error ? error.message : String(error);
  }
  if (identicalText) {
    right = left;
    rightError = leftError;
  } else {
    try {
      right = parseComparisonJson(rightText);
    } catch (error) {
      rightError = error instanceof Error ? error.message : String(error);
    }
  }
  const cursor = compareValues(left, right);
  let pending: IteratorResult<JsonDiffEntry> | undefined;
  // Keep only the currently inspected path's serialized values, never every full diff value.
  let cachedPath = '';
  let cachedValues: Partial<Record<JsonDiffSide, string | undefined>> = {};
  return {
    next(): JsonDiffResult {
      if (leftError || rightError) return { diffs: [], leftError, rightError, truncated: false };
      const diffs: JsonDiffEntry[] = [];
      pending ??= cursor.next();
      while (!pending.done && diffs.length < MAX_DIFFS) {
        diffs.push(pending.value);
        pending = cursor.next();
      }
      return { diffs, leftError: null, rightError: null, truncated: !pending.done };
    },
    readValue(path: Array<string | number>, side: JsonDiffSide, offset = 0, full = false): JsonDiffValue {
      if (detailSource !== null) {
        left = parseComparisonJson(detailSource);
        right = left;
        detailSource = null;
      }
      const pathKey = JSON.stringify(path);
      if (pathKey !== cachedPath) {
        cachedPath = pathKey;
        cachedValues = {};
      }
      if (!Object.hasOwn(cachedValues, side)) {
        let value = side === 'left' ? left : right;
        for (const key of path) {
          if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) {
            value = undefined;
            break;
          }
          value = (value as Record<string | number, unknown>)[key];
        }
        cachedValues[side] = value === undefined ? undefined : serializeComparisonValue(value);
      }
      const value = cachedValues[side];
      let start = Math.max(0, Math.min(value?.length ?? 0, Math.floor(offset) || 0));
      let end = start + DIFF_VALUE_CHUNK_SIZE;
      const splitsSurrogate = (position: number) => {
        const before = value?.charCodeAt(position - 1) ?? 0;
        const after = value?.charCodeAt(position) ?? 0;
        return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
      };
      if (splitsSurrogate(start)) start += 1;
      if (splitsSurrogate(end)) end += 1;
      return {
        text: full ? (value ?? '') : (value ?? '').slice(start, end),
        total: value?.length ?? 0,
        offset: start,
        missing: value === undefined,
      };
    },
  };
}

export function compareJsonTexts(leftText: string, rightText: string): JsonDiffResult {
  return createJsonComparison(leftText, rightText).next();
}
export type JsonCompareWorkerRequest =
  | { leftText: string; rightText: string }
  | { next: true }
  | { value: { id: number; path: Array<string | number>; side: JsonDiffSide; offset: number; full: boolean } };
export type JsonCompareWorkerResponse =
  | { result: JsonDiffResult }
  | { error: string }
  | { value: JsonDiffValue; id: number };
