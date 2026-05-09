import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LargeJsonReadonlyViewer, {
  LargeJsonReadonlyViewerHandle,
} from './LargeJsonReadonlyViewer';
import { buildLargeViewerData } from '../utils/largeJsonViewerData';

const fixtureText = [
  '{',
  '  "outer": {',
  '    "items": [',
  '      1,',
  '      2',
  '    ]',
  '  },',
  '  "name": "alpha"',
  '}',
].join('\n');

function renderViewer(overrides: Partial<React.ComponentProps<typeof LargeJsonReadonlyViewer>> = {}) {
  const text = overrides.text ?? fixtureText;
  const data = overrides.data ?? buildLargeViewerData(text, 1);
  if (!data) {
    throw new Error('Expected large viewer fixture data');
  }

  const props: React.ComponentProps<typeof LargeJsonReadonlyViewer> = {
    text,
    data,
    isDarkMode: false,
    wrapLongLines: false,
    collapsedLines: [],
    searchTerm: '',
    activeMatchIndex: 0,
    onCollapsedLinesChange: vi.fn(),
    onMatchCountChange: vi.fn(),
    onLocateOffset: vi.fn(),
    onCopyValue: vi.fn(),
    onEditValue: vi.fn(),
    onOpenFind: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<LargeJsonReadonlyViewer {...props} />),
    data,
    props,
  };
}

describe('LargeJsonReadonlyViewer', () => {
  afterEach(() => {
    cleanup();
  });

  it('reports search match count and renders highlights', async () => {
    const onMatchCountChange = vi.fn();

    renderViewer({
      searchTerm: 'name',
      onMatchCountChange,
    });

    await waitFor(() => {
      expect(onMatchCountChange).toHaveBeenLastCalledWith(1);
    });

    expect(document.querySelectorAll('.large-json-search-match')).toHaveLength(1);
  });

  it('syntax highlights JSON keys and values in the virtualized viewer', () => {
    renderViewer();

    expect(document.querySelector('.large-json-token-key')?.textContent).toBe('"outer"');
    expect(document.querySelector('.large-json-token-value')?.textContent).toBe('1');
  });

  it('keeps the gutter order aligned with Monaco: line number before fold control', () => {
    renderViewer();

    const row = document.querySelector('.large-json-row');
    expect(row?.children[0]).toHaveClass('large-json-line-number');
    expect(row?.children[1]).toHaveClass('large-json-fold-button');
  });

  it('preserves fold all and unfold all commands through the ref API', () => {
    const ref = createRef<LargeJsonReadonlyViewerHandle>();
    const onCollapsedLinesChange = vi.fn();
    const data = buildLargeViewerData(fixtureText, 1);
    if (!data) {
      throw new Error('Expected large viewer fixture data');
    }

    render(
      <LargeJsonReadonlyViewer
        ref={ref}
        text={fixtureText}
        data={data}
        isDarkMode={false}
        wrapLongLines={false}
        collapsedLines={[]}
        searchTerm=""
        activeMatchIndex={0}
        onCollapsedLinesChange={onCollapsedLinesChange}
        onMatchCountChange={vi.fn()}
        onLocateOffset={vi.fn()}
        onCopyValue={vi.fn()}
        onEditValue={vi.fn()}
        onOpenFind={vi.fn()}
      />
    );

    ref.current?.foldAll();
    expect(onCollapsedLinesChange).toHaveBeenCalledWith(data.regions.map((region) => region.startLine));

    ref.current?.unfoldAll();
    expect(onCollapsedLinesChange).toHaveBeenCalledWith([]);
  });

  it('uses right-side clicks and context menu actions for locate, copy, and edit callbacks', async () => {
    const onLocateOffset = vi.fn();
    const onCopyValue = vi.fn().mockResolvedValue(undefined);
    const onEditValue = vi.fn().mockResolvedValue(undefined);

    renderViewer({
      onLocateOffset,
      onCopyValue,
      onEditValue,
    });

    const line = document.querySelector('.large-json-line-text[title*="alpha"]');
    expect(line).not.toBeNull();
    if (!line) {
      throw new Error('Expected alpha line in large viewer');
    }
    fireEvent.mouseUp(line, { button: 0 });
    expect(onLocateOffset).toHaveBeenCalledTimes(1);
    expect(onLocateOffset).toHaveBeenLastCalledWith(expect.any(Number));

    const keyToken = document.querySelector('.large-json-line-text[title*="alpha"] .large-json-token-key');
    expect(keyToken).not.toBeNull();
    if (!keyToken) {
      throw new Error('Expected a key token in the alpha line');
    }

    const alphaLineStart = fixtureText.indexOf('  "name"');
    fireEvent.mouseUp(keyToken, { button: 0 });
    expect(onLocateOffset).toHaveBeenCalledTimes(2);
    expect(onLocateOffset).toHaveBeenLastCalledWith(expect.any(Number));
    expect(onLocateOffset.mock.calls[1][0]).toBeGreaterThan(alphaLineStart);

    fireEvent.contextMenu(line);
    const menuItem = await screen.findByRole('button', { name: 'Copy value' });
    fireEvent.click(menuItem);

    await waitFor(() => {
      expect(onCopyValue).toHaveBeenCalledTimes(1);
    });
    expect(onCopyValue).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    const editMenuItem = await screen.findByRole('button', { name: 'Edit value' });
    fireEvent.click(editMenuItem);

    await waitFor(() => {
      expect(onEditValue).toHaveBeenCalledTimes(1);
    });
    expect(onEditValue).toHaveBeenLastCalledWith(expect.any(Number));
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
    selection?.removeAllRanges();
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
    selection?.removeAllRanges();
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

  it('auto-expands collapsed regions when the active match falls inside them', async () => {
    const onCollapsedLinesChange = vi.fn();

    renderViewer({
      collapsedLines: [3],
      searchTerm: '1',
      activeMatchIndex: 0,
      onCollapsedLinesChange,
    });

    await waitFor(() => {
      expect(onCollapsedLinesChange).toHaveBeenCalledWith([]);
    });
  });
});
