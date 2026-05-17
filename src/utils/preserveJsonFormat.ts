import { applyEdits, modify } from 'jsonc-parser';
import type { FormattingOptions, JSONPath } from 'jsonc-parser';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface JsonDiff {
  path: JSONPath;
  value: JsonValue | undefined;
  structural: boolean;
}

interface SaveJsonPreserveOptions {
  originalValue?: JsonValue;
}

interface JsonNodeRange {
  startOffset: number;
  endOffset: number;
}

interface SaveJsonNodePreserveOptions {
  range?: JsonNodeRange;
}

const MAX_PRESERVED_EDITS = 200;

function isObjectValue(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getJsonValueAtPath(value: JsonValue, path: JSONPath): JsonValue {
  let current: JsonValue = value;

  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') {
      if (segment < 0 || segment >= current.length) {
        throw new Error('当前节点不存在');
      }
      current = current[segment];
      continue;
    }

    if (isObjectValue(current) && typeof segment === 'string') {
      if (!(segment in current)) {
        throw new Error('当前节点不存在');
      }
      current = current[segment];
      continue;
    }

    throw new Error('当前节点不存在');
  }

  return current;
}

function deleteJsonValueAtPath(value: JsonValue, path: JSONPath) {
  const lastSegment = path[path.length - 1];
  const parent = getJsonValueAtPath(value, path.slice(0, -1));

  if (Array.isArray(parent) && typeof lastSegment === 'number') {
    if (lastSegment < 0 || lastSegment >= parent.length) {
      throw new Error('当前节点不存在');
    }
    parent.splice(lastSegment, 1);
    return;
  }

  if (isObjectValue(parent) && typeof lastSegment === 'string') {
    if (!(lastSegment in parent)) {
      throw new Error('当前节点不存在');
    }
    delete parent[lastSegment];
    return;
  }

  throw new Error('当前节点无法删除');
}

function isScalarValue(value: JsonValue) {
  return value === null || typeof value !== 'object';
}

function getOriginalStyle(text: string) {
  const trimmed = text.trim();
  const compact = !/[\r\n]/.test(trimmed);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingWhitespace = text.match(/\s*$/)?.[0] ?? '';
  const leadingWhitespace = text.match(/^\s*/)?.[0] ?? '';
  const indentMatch = text.match(/\r?\n([ \t]+)\S/);
  const indent = indentMatch?.[1] ?? '  ';

  return {
    compact,
    indent,
    leadingWhitespace,
    newline,
    trailingWhitespace,
  };
}

function getFormattingOptions(text: string): FormattingOptions {
  const style = getOriginalStyle(text);
  const usesTabs = style.indent.includes('\t');

  return {
    eol: style.newline,
    insertSpaces: !usesTabs,
    tabSize: usesTabs ? 1 : Math.max(1, style.indent.length),
  };
}

function serializeWithOriginalStyle(originalText: string, value: JsonValue) {
  const style = getOriginalStyle(originalText);
  const serialized = style.compact
    ? JSON.stringify(value)
    : JSON.stringify(value, null, style.indent).replace(/\n/g, style.newline);

  return `${style.leadingWhitespace}${serialized}${style.trailingWhitespace}`;
}

function isValidRange(text: string, range: JsonNodeRange) {
  return Number.isInteger(range.startOffset)
    && Number.isInteger(range.endOffset)
    && range.startOffset >= 0
    && range.endOffset >= range.startOffset
    && range.endOffset <= text.length;
}

function serializeDirectNodeReplacement(
  originalText: string,
  range: JsonNodeRange | undefined,
  editedValue: JsonValue
) {
  if (!range || !isValidRange(originalText, range)) {
    return null;
  }

  const originalNodeText = originalText.slice(range.startOffset, range.endOffset);
  try {
    JSON.parse(originalNodeText);
  } catch {
    return null;
  }

  if (isScalarValue(editedValue)) {
    return JSON.stringify(editedValue);
  }

  if (getOriginalStyle(originalText).compact) {
    return JSON.stringify(editedValue);
  }

  return null;
}

function collectDiffs(
  originalValue: JsonValue,
  editedValue: JsonValue,
  path: JSONPath,
  diffs: JsonDiff[]
) {
  if (diffs.length > MAX_PRESERVED_EDITS) {
    return;
  }

  if (Object.is(originalValue, editedValue)) {
    return;
  }

  if (Array.isArray(originalValue) && Array.isArray(editedValue)) {
    if (originalValue.length !== editedValue.length) {
      diffs.push({ path, value: editedValue, structural: true });
      return;
    }

    originalValue.forEach((item, index) => {
      collectDiffs(item, editedValue[index], [...path, index], diffs);
    });
    return;
  }

  if (isObjectValue(originalValue) && isObjectValue(editedValue)) {
    Object.keys(originalValue).forEach((key) => {
      if (!(key in editedValue)) {
        diffs.push({ path: [...path, key], value: undefined, structural: true });
        return;
      }

      collectDiffs(originalValue[key], editedValue[key], [...path, key], diffs);
    });

    Object.keys(editedValue).forEach((key) => {
      if (!(key in originalValue)) {
        diffs.push({ path: [...path, key], value: editedValue[key], structural: true });
      }
    });
    return;
  }

  diffs.push({
    path,
    value: editedValue,
    structural: !(isScalarValue(originalValue) && isScalarValue(editedValue)),
  });
}

export function saveJsonPreservingOriginalFormat(
  originalText: string,
  editedText: string,
  options: SaveJsonPreserveOptions = {}
) {
  const editedValue = JSON.parse(editedText) as JsonValue;
  const style = getOriginalStyle(originalText);

  if (style.compact) {
    return serializeWithOriginalStyle(originalText, editedValue);
  }

  let originalValue: JsonValue;

  if (options.originalValue !== undefined) {
    originalValue = options.originalValue;
  } else {
    try {
      originalValue = JSON.parse(originalText) as JsonValue;
    } catch {
      return serializeWithOriginalStyle(originalText, editedValue);
    }
  }

  const diffs: JsonDiff[] = [];
  collectDiffs(originalValue, editedValue, [], diffs);

  if (diffs.length === 0) {
    return originalText;
  }

  const shouldFallbackSerialize = diffs.length > MAX_PRESERVED_EDITS;

  if (shouldFallbackSerialize) {
    return serializeWithOriginalStyle(originalText, editedValue);
  }

  const formattingOptions = getFormattingOptions(originalText);

  return diffs.reduce((currentText, diff) => (
    applyEdits(
      currentText,
      modify(currentText, diff.path, diff.value, { formattingOptions })
    )
  ), originalText);
}

export function saveJsonNodePreservingOriginalFormat(
  originalText: string,
  path: JSONPath,
  editedText: string,
  options: SaveJsonNodePreserveOptions = {}
) {
  const editedValue = JSON.parse(editedText) as JsonValue;

  if (path.length === 0) {
    return serializeWithOriginalStyle(originalText, editedValue);
  }

  const directReplacement = serializeDirectNodeReplacement(
    originalText,
    options.range,
    editedValue
  );
  if (directReplacement !== null) {
    const { startOffset, endOffset } = options.range!;
    return `${originalText.slice(0, startOffset)}${directReplacement}${originalText.slice(endOffset)}`;
  }

  return applyEdits(
    originalText,
    modify(originalText, path, editedValue, {
      formattingOptions: getFormattingOptions(originalText),
    })
  );
}

export function deleteJsonNodePreservingOriginalFormat(
  originalText: string,
  path: JSONPath
) {
  if (path.length === 0) {
    throw new Error('不能删除根节点');
  }

  if (getOriginalStyle(originalText).compact) {
    const originalValue = JSON.parse(originalText) as JsonValue;
    deleteJsonValueAtPath(originalValue, path);
    return serializeWithOriginalStyle(originalText, originalValue);
  }

  return applyEdits(
    originalText,
    modify(originalText, path, undefined, {
      formattingOptions: getFormattingOptions(originalText),
    })
  );
}

export function renameJsonObjectKeyPreservingOriginalFormat(
  originalText: string,
  path: JSONPath,
  nextKey: string
) {
  const oldKey = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const normalizedNextKey = nextKey.trim();

  if (typeof oldKey !== 'string' || path.length === 0) {
    throw new Error('只有对象 key 可以重命名');
  }

  if (!normalizedNextKey) {
    throw new Error('新的 key 不能为空');
  }

  if (normalizedNextKey === oldKey) {
    return originalText;
  }

  const originalValue = JSON.parse(originalText) as JsonValue;
  const parentValue = getJsonValueAtPath(originalValue, parentPath);

  if (!isObjectValue(parentValue)) {
    throw new Error('只有对象 key 可以重命名');
  }

  if (!(oldKey in parentValue)) {
    throw new Error('当前 key 不存在');
  }

  if (normalizedNextKey in parentValue) {
    throw new Error('新的 key 已存在');
  }

  const value = parentValue[oldKey];

  if (getOriginalStyle(originalText).compact) {
    delete parentValue[oldKey];
    parentValue[normalizedNextKey] = value;
    return serializeWithOriginalStyle(originalText, originalValue);
  }

  const formattingOptions = getFormattingOptions(originalText);
  const withoutOldKey = applyEdits(
    originalText,
    modify(originalText, path, undefined, { formattingOptions })
  );

  return applyEdits(
    withoutOldKey,
    modify(withoutOldKey, [...parentPath, normalizedNextKey], value, { formattingOptions })
  );
}
