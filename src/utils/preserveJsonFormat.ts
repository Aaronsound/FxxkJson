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

const MAX_PRESERVED_EDITS = 200;

function isObjectValue(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  editedText: string
) {
  const editedValue = JSON.parse(editedText) as JsonValue;

  if (path.length === 0) {
    return serializeWithOriginalStyle(originalText, editedValue);
  }

  return applyEdits(
    originalText,
    modify(originalText, path, editedValue, {
      formattingOptions: getFormattingOptions(originalText),
    })
  );
}
