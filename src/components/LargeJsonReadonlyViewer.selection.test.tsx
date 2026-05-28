import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureText, renderViewer } from './LargeJsonReadonlyViewer.testUtils';

describe('LargeJsonReadonlyViewer selection and copy', () => {
  afterEach(() => {
    cleanup();
    window.electronAPI = undefined;
    window.getSelection()?.removeAllRanges();
  });

  it('marks rows that overlap the selected right-side node range', () => {
    const start = fixtureText.indexOf('"alpha"');

    renderViewer({
      selectedRange: {
        start,
        end: start + '"alpha"'.length,
      },
    });

    const selectedLine = document.querySelector('.large-json-line-text[title*="alpha"]');
    const firstLine = document.querySelector('.large-json-line-text[data-line-number="1"]');

    expect(selectedLine?.closest('.large-json-row')).toHaveClass('selected');
    expect(firstLine?.closest('.large-json-row')).not.toHaveClass('selected');
    expect(document.querySelector('.large-json-node-selection-highlight')?.textContent).toBe('"alpha"');
  });

  it('renders precise node range highlights across multiple large-viewer lines', () => {
    const start = fixtureText.indexOf('{', fixtureText.indexOf('"outer"'));
    const end = fixtureText.indexOf('  },') + '  }'.length;

    renderViewer({
      selectedRange: {
        start,
        end,
      },
    });

    const highlightedText = Array.from(document.querySelectorAll('.large-json-node-selection-highlight'))
      .map((node) => node.textContent)
      .join('\n');

    expect(highlightedText).toContain('{');
    expect(highlightedText).toContain('"items"');
    expect(highlightedText).toContain(']');
    expect(highlightedText).toContain('}');
  });

  it('shows a node highlight on the visible preview for collapsed selected regions', () => {
    const hiddenStart = fixtureText.indexOf('"items"');

    renderViewer({
      collapsedLines: [2],
      selectedRange: {
        start: hiddenStart,
        end: hiddenStart + '"items"'.length,
      },
    });

    const highlightedText = Array.from(
      document.querySelectorAll(
        '.large-json-line-text[data-line-number="2"][data-collapsed="true"] .large-json-node-selection-highlight'
      )
    )
      .map((node) => node.textContent)
      .join('');

    expect(highlightedText).toContain('"outer"');
    expect(highlightedText).toContain('{');
    expect(highlightedText).toContain('...');
  });

  it('copies the underlying JSON text instead of the collapsed preview', () => {
    renderViewer({
      collapsedLines: [1],
    });

    const line = document.querySelector('.large-json-line-text[data-collapsed="true"]');
    expect(line).not.toBeNull();
    if (!line) {
      throw new Error('Expected a collapsed line');
    }
    expect(line.textContent).toContain('...');
    expect(line.textContent).not.toContain('... }');
    expect(document.querySelector('.large-json-line-text[data-line-number="9"]')?.textContent).toBe('}');

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(line);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const clipboardData = { setData: vi.fn() };
    fireEvent.copy(line, { clipboardData });

    expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', fixtureText);
  });

  it('does not copy a hidden trailing comma when a collapsed array item is selected', () => {
    const arrayText = [
      '[',
      '  {',
      '    "id": 0,',
      '    "name": "first"',
      '  },',
      '  {',
      '    "id": 1,',
      '    "name": "second"',
      '  }',
      ']',
    ].join('\n');

    renderViewer({
      text: arrayText,
      collapsedLines: [2],
    });

    const line = document.querySelector('.large-json-line-text[data-line-number="2"][data-collapsed="true"]');
    expect(line).not.toBeNull();
    if (!line) {
      throw new Error('Expected a collapsed array item');
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(line);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const clipboardData = { setData: vi.fn() };
    fireEvent.copy(line, { clipboardData });

    const copied = clipboardData.setData.mock.calls[0]?.[1];
    expect(copied).toBeTypeOf('string');
    expect(copied.trim().endsWith(',')).toBe(false);
    expect(JSON.parse(copied)).toEqual({ id: 0, name: 'first' });
  });

  it('keeps select-all and copy scoped to the large JSON viewer text', () => {
    renderViewer();

    const viewer = document.querySelector('.large-json-viewer');
    expect(viewer).not.toBeNull();
    if (!viewer) {
      throw new Error('Expected large viewer');
    }

    fireEvent.keyDown(viewer, { key: 'a', ctrlKey: true });
    const clipboardData = { setData: vi.fn() };
    fireEvent.copy(viewer, { clipboardData });

    expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', fixtureText);
  });

  it('opens the pane search from the find shortcut', () => {
    const onOpenFind = vi.fn();
    renderViewer({ onOpenFind });

    const viewer = document.querySelector('.large-json-viewer');
    expect(viewer).not.toBeNull();
    if (!viewer) {
      throw new Error('Expected large viewer');
    }

    fireEvent.keyDown(viewer, { key: 'f', ctrlKey: true });

    expect(onOpenFind).toHaveBeenCalledTimes(1);
  });

  it('also scopes Alt+A copy to the large JSON viewer text', () => {
    renderViewer();

    const viewer = document.querySelector('.large-json-viewer');
    expect(viewer).not.toBeNull();
    if (!viewer) {
      throw new Error('Expected large viewer');
    }

    fireEvent.keyDown(viewer, { key: 'a', altKey: true });
    const clipboardData = { setData: vi.fn() };
    fireEvent.copy(viewer, { clipboardData });

    expect(clipboardData.setData).toHaveBeenCalledWith('text/plain', fixtureText);
  });

  it('copies the selected viewer text with Alt+C', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    window.electronAPI = {
      writeClipboardText: writeText,
    } as unknown as Window['electronAPI'];
    renderViewer();

    const viewer = document.querySelector('.large-json-viewer');
    const line = document.querySelector('.large-json-line-text[title*="alpha"]');
    expect(viewer).not.toBeNull();
    expect(line).not.toBeNull();
    if (!viewer || !line) {
      throw new Error('Expected large viewer and alpha line');
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(line);
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.keyDown(viewer, { key: 'c', altKey: true });

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('  "name": "alpha"');
    });
  });

  it('keeps a manual text selection instead of locating a node on mouseup', () => {
    const onLocateOffset = vi.fn();
    renderViewer({ onLocateOffset });

    const line = document.querySelector('.large-json-line-text[title*="alpha"]');
    expect(line).not.toBeNull();
    if (!line) {
      throw new Error('Expected alpha line');
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(line);
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(line, { button: 0 });

    expect(onLocateOffset).not.toHaveBeenCalled();
    expect(selection?.isCollapsed).toBe(false);
  });
});
