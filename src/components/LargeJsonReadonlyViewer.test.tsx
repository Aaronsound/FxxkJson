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
  const data = buildLargeViewerData(fixtureText, 1);
  if (!data) {
    throw new Error('Expected large viewer fixture data');
  }

  const props: React.ComponentProps<typeof LargeJsonReadonlyViewer> = {
    text: fixtureText,
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
      />
    );

    ref.current?.foldAll();
    expect(onCollapsedLinesChange).toHaveBeenCalledWith(data.regions.map((region) => region.startLine));

    ref.current?.unfoldAll();
    expect(onCollapsedLinesChange).toHaveBeenCalledWith([]);
  });

  it('uses right-side clicks and context menu actions for locate and copy callbacks', async () => {
    const onLocateOffset = vi.fn();
    const onCopyValue = vi.fn().mockResolvedValue(undefined);

    renderViewer({
      onLocateOffset,
      onCopyValue,
    });

    const line = document.querySelector('.large-json-line-text[title*="alpha"]');
    expect(line).not.toBeNull();
    if (!line) {
      throw new Error('Expected alpha line in large viewer');
    }
    fireEvent.mouseUp(line, { button: 0 });
    expect(onLocateOffset).toHaveBeenCalledTimes(1);
    expect(onLocateOffset).toHaveBeenLastCalledWith(expect.any(Number));

    fireEvent.contextMenu(line);
    const menuItem = await screen.findByRole('button', { name: 'Copy value' });
    fireEvent.click(menuItem);

    await waitFor(() => {
      expect(onCopyValue).toHaveBeenCalledTimes(1);
    });
    expect(onCopyValue).toHaveBeenLastCalledWith(expect.any(Number));
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
