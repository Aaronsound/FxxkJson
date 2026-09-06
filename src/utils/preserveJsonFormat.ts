import { applyEdits, modify } from 'jsonc-parser';
import type { JSONPath } from 'jsonc-parser';
import type { JsonTextPatch } from '../types/jsonTool';
import { getJsonPathLocateRange } from './jsonPathLocate';
import { jsonTokens, layoutJsonTokens } from './losslessJson';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
interface JsonNodeRange {
  startOffset: number;
  endOffset: number;
}
interface SaveJsonNodePreserveOptions {
  range?: JsonNodeRange;
}
export interface SaveJsonNodePreserveResult {
  patch: JsonTextPatch | null;
  text: string;
}

function getOriginalStyle(text: string) {
  const compact = !/[\r\n]/.test(text.trim());
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const indent = text.match(/\r?\n([ \t]+)\S/)?.[1] ?? '  ';
  return { compact, newline, indent, leading: text.match(/^\s*/)?.[0] ?? '', trailing: text.match(/\s*$/)?.[0] ?? '' };
}

function layoutLikeOriginal(original: string, edited: string) {
  const style = getOriginalStyle(original);
  return style.leading + layoutJsonTokens(edited, style.compact ? '' : style.indent, style.newline) + style.trailing;
}

/** Preserve original whitespace when the edit only replaces scalar tokens. */
function patchMatchingTokens(original: string, edited: string): string | null {
  const left = jsonTokens(original);
  const right = jsonTokens(edited);
  const parts: string[] = [];
  let copied = 0;
  for (;;) {
    const a = left.next().value;
    const b = right.next().value;
    if (!a || !b) {
      if (a || b) return null;
      parts.push(original.slice(copied));
      return parts.join('');
    }
    if (a.text === b.text) continue;
    if ((a.text.length === 1 && '{}[],:'.includes(a.text)) || (b.text.length === 1 && '{}[],:'.includes(b.text)))
      return null;
    parts.push(original.slice(copied, a.index), b.text);
    copied = a.index + a.text.length;
  }
}

export function saveJsonPreservingOriginalFormat(
  originalText: string,
  editedText: string,
  _options: { originalValue?: JsonValue } = {}
) {
  JSON.parse(editedText);
  if (getOriginalStyle(originalText).compact) return layoutLikeOriginal(originalText, editedText);
  return patchMatchingTokens(originalText, editedText) ?? layoutLikeOriginal(originalText, editedText);
}

export function saveJsonNodePreservingOriginalFormat(
  originalText: string,
  path: JSONPath,
  editedText: string,
  options: SaveJsonNodePreserveOptions = {}
) {
  return saveJsonNodePreservingOriginalFormatWithPatch(originalText, path, editedText, options).text;
}

export function saveJsonNodePreservingOriginalFormatWithPatch(
  originalText: string,
  path: JSONPath,
  editedText: string,
  options: SaveJsonNodePreserveOptions = {}
): SaveJsonNodePreserveResult {
  JSON.parse(editedText);
  if (path.length === 0) return { patch: null, text: layoutLikeOriginal(originalText, editedText) };
  let range = options.range;
  if (range) {
    try {
      if (range.startOffset < 0 || range.endOffset > originalText.length) throw new Error('stale range');
      JSON.parse(originalText.slice(range.startOffset, range.endOffset));
    } catch {
      range = undefined;
    }
  }
  range ??= getJsonPathLocateRange(originalText, path) ?? undefined;
  if (!range) throw new Error('当前节点不存在');
  const style = getOriginalStyle(originalText);
  const lineStart = originalText.lastIndexOf('\n', range.startOffset - 1) + 1;
  const baseIndent = originalText.slice(lineStart, range.startOffset).match(/^[ \t]*/)?.[0] ?? '';
  const text = layoutJsonTokens(editedText, style.compact ? '' : style.indent, style.newline).replace(
    /\n/g,
    `\n${baseIndent}`
  );
  const patch = { sourceLength: originalText.length, ...range, text };
  return { patch, text: originalText.slice(0, range.startOffset) + text + originalText.slice(range.endOffset) };
}

export function deleteJsonNodePreservingOriginalFormat(originalText: string, path: JSONPath) {
  if (!path.length) throw new Error('不能删除根节点');
  const style = getOriginalStyle(originalText);
  // jsonc-parser removes a textual range; it does not serialize neighboring values.
  const result = applyEdits(originalText, modify(originalText, path, undefined, {}));
  return style.compact ? layoutLikeOriginal(originalText, result) : result;
}

export function renameJsonObjectKeyPreservingOriginalFormat(originalText: string, path: JSONPath, nextKey: string) {
  const oldKey = path[path.length - 1];
  const name = nextKey.trim();
  if (typeof oldKey !== 'string' || !path.length) throw new Error('只有对象 key 可以重命名');
  if (!name) throw new Error('新的 key 不能为空');
  if (name === oldKey) return originalText;
  const parent = path.slice(0, -1);
  if (getJsonPathLocateRange(originalText, [...parent, name])) throw new Error('新的 key 已存在');
  const range = getJsonPathLocateRange(originalText, path);
  if (!range) throw new Error('当前 key 不存在');
  const literal = originalText.slice(range.startOffset, range.endOffset);
  const style = getOriginalStyle(originalText);
  const formattingOptions = {
    eol: style.newline,
    insertSpaces: !style.indent.includes('\t'),
    tabSize: style.indent.length,
  };
  const removed = applyEdits(originalText, modify(originalText, path, undefined, { formattingOptions }));
  // Insert a placeholder, then splice in the untouched value, including duplicate
  // members or precise numbers. Preserve the existing rename-to-end behavior.
  const inserted = applyEdits(removed, modify(removed, [...parent, name], null, { formattingOptions }));
  const updated = saveJsonNodePreservingOriginalFormat(inserted, [...parent, name], literal);
  return style.compact ? layoutLikeOriginal(originalText, updated) : updated;
}
