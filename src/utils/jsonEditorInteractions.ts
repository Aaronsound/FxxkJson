import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  SEARCH_BATCH_SIZE,
} from '../types/jsonTool';
import type { JsonSearchOptions } from '../types/jsonTool';
import {
  buildLineStarts,
  findTextSearchBatch,
} from './searchText';

interface JsonEditorOptionsArgs {
  largeMode: boolean;
  wrapLongLines: boolean;
  readOnly?: boolean;
  enableStructuralFolding?: boolean;
}

export function formatBytes(value: number) {
  if (value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 100 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatDuration(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return null;
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
}

export function getMonacoSearchBatch(
  model: monaco.editor.ITextModel,
  searchTerm: string,
  searchOptions: JsonSearchOptions,
  startOffset = 0,
  maxResults = SEARCH_BATCH_SIZE
) {
  const text = model.getValue();
  const result = findTextSearchBatch(
    text,
    buildLineStarts(text),
    model.getLineCount(),
    searchTerm,
    searchOptions,
    startOffset,
    maxResults
  );

  return {
    ...result,
    ranges: result.matches.map((match) => {
      const start = model.getPositionAt(match.start);
      const end = model.getPositionAt(match.end);
      return new monaco.Range(
        start.lineNumber,
        start.column,
        end.lineNumber,
        end.column
      );
    }),
  };
}

export function getReplacementText(
  model: monaco.editor.ITextModel,
  range: monaco.Range,
  searchTerm: string,
  searchOptions: JsonSearchOptions,
  replaceText: string
) {
  if (!searchOptions.useRegex) {
    return replaceText;
  }

  try {
    const source = model.getValueInRange(range);
    return source.replace(
      new RegExp(searchTerm, searchOptions.matchCase ? '' : 'i'),
      replaceText
    );
  } catch {
    return replaceText;
  }
}

export function getMonacoOptions({
  largeMode,
  wrapLongLines,
  readOnly = false,
  enableStructuralFolding = !largeMode,
}: JsonEditorOptionsArgs): monaco.editor.IStandaloneEditorConstructionOptions {
  const preserveFoldingForLargeReadonly = readOnly && enableStructuralFolding;

  return {
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    largeFileOptimizations: preserveFoldingForLargeReadonly ? false : true,
    wordWrap: wrapLongLines ? 'on' : 'off',
    folding: enableStructuralFolding,
    showFoldingControls: enableStructuralFolding ? 'always' : 'never',
    foldingStrategy: 'indentation',
    foldingMaximumRegions: preserveFoldingForLargeReadonly ? 50000 : 5000,
    foldingHighlight: enableStructuralFolding,
    glyphMargin: false,
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    renderWhitespace: 'none',
    renderValidationDecorations: 'off',
    matchBrackets: 'never',
    codeLens: false,
    lineDecorationsWidth: enableStructuralFolding ? 16 : 0,
    lineNumbersMinChars: 3,
    maxTokenizationLineLength: largeMode ? 2000 : 1000000,
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false,
    },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    scrollbar: {
      alwaysConsumeMouseWheel: true,
    },
    wordBasedSuggestions: largeMode ? 'off' : 'currentDocument',
    hover: {
      enabled: !largeMode,
    },
    links: !largeMode,
    readOnly,
    guides: {
      indentation: false,
    },
  };
}
