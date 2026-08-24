import type React from 'react';
import { createRef } from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LargeJsonReadonlyViewer, { type LargeJsonReadonlyViewerHandle } from './LargeJsonReadonlyViewer';
import { fixtureText, renderViewer } from './LargeJsonReadonlyViewer.testUtils';
import { buildLargeViewerData } from '../utils/largeJsonViewerData';
import { JSON_EDITOR_LINE_HEIGHT } from '../utils/jsonEditorTypography';

describe('LargeJsonReadonlyViewer rendering', () => {
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

  it('does not repeat locate for the same active search match after callback props refresh', async () => {
    const data = buildLargeViewerData(fixtureText, 1);
    if (!data) {
      throw new Error('Expected large viewer fixture data');
    }
    const firstLocate = vi.fn();
    const refreshedLocate = vi.fn();
    const firstCollapsedChange = vi.fn();
    const refreshedCollapsedChange = vi.fn();
    const baseProps: React.ComponentProps<typeof LargeJsonReadonlyViewer> = {
      text: fixtureText,
      data,
      isDarkMode: false,
      wrapLongLines: false,
      foldState: { mode: 'explicit', lines: [] },
      searchTerm: 'name',
      activeMatchIndex: 0,
      onFoldStateChange: firstCollapsedChange,
      onMatchCountChange: vi.fn(),
      onLocateOffset: firstLocate,
      onCopyPath: vi.fn(),
      onCopyKey: vi.fn(),
      onCopyValue: vi.fn(),
      onCopyCompactJson: vi.fn(),
      onCopyFormattedJson: vi.fn(),
      onEditValue: vi.fn(),
      onDeleteValue: vi.fn(),
      onRenameKey: vi.fn(),
      onUnescapeValue: vi.fn(),
      onOpenFind: vi.fn(),
    };

    const { rerender } = render(<LargeJsonReadonlyViewer {...baseProps} />);

    await waitFor(() => {
      expect(firstLocate).toHaveBeenCalledTimes(1);
    });

    rerender(
      <LargeJsonReadonlyViewer
        {...baseProps}
        onFoldStateChange={refreshedCollapsedChange}
        onLocateOffset={refreshedLocate}
      />
    );

    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
    expect(refreshedLocate).not.toHaveBeenCalled();
  });

  it('syntax highlights JSON keys and values in the virtualized viewer', () => {
    renderViewer();

    expect(document.querySelector('.large-json-token-key')?.textContent).toBe('"outer"');
    expect(document.querySelector('.large-json-token-value')?.textContent).toBe('1');
  });

  it('truncates very long line titles to keep DOM attributes lightweight', () => {
    const longValue = 'x'.repeat(5000);
    const text = ['{', `  "payload": "${longValue}"`, '}'].join('\n');

    renderViewer({ text });

    const line = document.querySelector<HTMLElement>('.large-json-line-text[data-line-number="2"]');
    expect(line).not.toBeNull();
    const title = line?.getAttribute('title') ?? '';
    expect(title.length).toBeLessThan(1100);
    expect(title.endsWith('...')).toBe(true);
    expect(title.length).toBeLessThan((line?.textContent ?? '').length);
  });

  it('keeps the gutter order aligned with Monaco: line number before fold control', () => {
    renderViewer();

    const row = document.querySelector('.large-json-row');
    expect(row?.children[0]).toHaveClass('large-json-line-number');
    expect(row?.children[1]).toHaveClass('large-json-fold-button');
  });

  it('uses the shared editor line height for virtual rows', () => {
    renderViewer();

    const row = document.querySelector<HTMLElement>('.large-json-row');
    expect(row?.style.height).toBe(`${JSON_EDITOR_LINE_HEIGHT}px`);
  });

  it('keeps short lines compact while wrapping only a genuinely long line', () => {
    const text = ['{', `  "payload": "${'x'.repeat(500)}",`, '  "ok": true', '}'].join('\n');
    renderViewer({ text, wrapLongLines: true });

    const firstRow = document.querySelector<HTMLElement>('.large-json-line-text[data-line-number="1"]')?.parentElement;
    const longRow = document.querySelector<HTMLElement>('.large-json-line-text[data-line-number="2"]')?.parentElement;
    const followingRow = document.querySelector<HTMLElement>(
      '.large-json-line-text[data-line-number="3"]'
    )?.parentElement;

    expect(firstRow?.style.height).toBe(`${JSON_EDITOR_LINE_HEIGHT}px`);
    expect(longRow?.style.height).toBe(`${JSON_EDITOR_LINE_HEIGHT * 4}px`);
    expect(followingRow?.style.top).toBe(`${JSON_EDITOR_LINE_HEIGHT * 5}px`);
  });

  it('preserves fold all and unfold all commands through the ref API', () => {
    const ref = createRef<LargeJsonReadonlyViewerHandle>();
    const onFoldStateChange = vi.fn();
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
        foldState={{ mode: 'explicit', lines: [] }}
        searchTerm=""
        activeMatchIndex={0}
        onFoldStateChange={onFoldStateChange}
        onMatchCountChange={vi.fn()}
        onLocateOffset={vi.fn()}
        onCopyPath={vi.fn()}
        onCopyKey={vi.fn()}
        onCopyValue={vi.fn()}
        onCopyCompactJson={vi.fn()}
        onCopyFormattedJson={vi.fn()}
        onEditValue={vi.fn()}
        onDeleteValue={vi.fn()}
        onRenameKey={vi.fn()}
        onUnescapeValue={vi.fn()}
        onOpenFind={vi.fn()}
      />
    );

    ref.current?.foldAll();
    expect(onFoldStateChange).toHaveBeenCalledWith({ mode: 'all-except', lines: [] });

    ref.current?.unfoldAll();
    expect(onFoldStateChange).toHaveBeenCalledWith({ mode: 'explicit', lines: [] });
  });

  it('auto-expands collapsed regions when the active match falls inside them', async () => {
    const onFoldStateChange = vi.fn();

    renderViewer({
      foldState: { mode: 'explicit', lines: [3] },
      searchTerm: '1',
      activeMatchIndex: 0,
      onFoldStateChange,
    });

    await waitFor(() => {
      expect(onFoldStateChange).toHaveBeenCalledWith({ mode: 'explicit', lines: [] });
    });
  });
});
