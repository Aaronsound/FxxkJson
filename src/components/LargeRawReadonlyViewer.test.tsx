import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSON_EDITOR_LINE_HEIGHT } from '../utils/jsonEditorTypography';
import { buildEscapedStringLiteralRawViewerData, buildLargeRawViewerData } from '../utils/largeRawViewerData';
import LargeRawReadonlyViewer, {
  areLargeRawReadonlyRowPropsEqual,
  type LargeRawReadonlyRowProps,
  type LargeRawReadonlyViewerHandle,
} from './LargeRawReadonlyViewer';

describe('LargeRawReadonlyViewer', () => {
  afterEach(cleanup);
  function makeRect(left: number, right: number): DOMRect {
    return {
      x: left,
      y: 0,
      width: right - left,
      height: JSON_EDITOR_LINE_HEIGHT,
      top: 0,
      right,
      bottom: JSON_EDITOR_LINE_HEIGHT,
      left,
      toJSON: () => ({}),
    } as DOMRect;
  }

  it('reuses unchanged virtual rows across scrolling and unrelated highlight changes', () => {
    const base: LargeRawReadonlyRowProps = {
      chunkEnd: 2000,
      chunkStart: 0,
      highlightRange: null,
      lineNumber: 1,
      rowIndex: 0,
      syntaxState: 0,
      text: 'x'.repeat(4000),
    };

    expect(areLargeRawReadonlyRowPropsEqual(base, { ...base, highlightRange: { start: 3000, end: 3010 } })).toBe(true);
    expect(areLargeRawReadonlyRowPropsEqual(base, { ...base, highlightRange: { start: 100, end: 110 } })).toBe(false);
    expect(
      areLargeRawReadonlyRowPropsEqual(
        { ...base, highlightRange: { start: 100, end: 110 } },
        { ...base, highlightRange: { start: 100, end: 110 } }
      )
    ).toBe(true);
    expect(areLargeRawReadonlyRowPropsEqual(base, { ...base, text: `${base.text}y` })).toBe(false);
  });

  it('reveals and highlights raw offsets without rendering one giant row', async () => {
    const ref = createRef<LargeRawReadonlyViewerHandle>();
    const text = `${'a'.repeat(4500)}"target"${'b'.repeat(4500)}`;
    const start = text.indexOf('"target"');

    render(
      <LargeRawReadonlyViewer
        ref={ref}
        text={text}
        isDarkMode={false}
        highlightRange={{ start, end: start + '"target"'.length }}
      />
    );

    ref.current?.revealRange(start, start + '"target"'.length);

    await waitFor(() => {
      expect(screen.getByText('"target"')).toHaveClass('large-raw-highlight');
    });

    expect(document.querySelectorAll('.large-raw-row').length).toBeLessThan(50);
  });

  it('scrolls horizontally to the exact offset inside a large raw chunk', async () => {
    const ref = createRef<LargeRawReadonlyViewerHandle>();
    const text = `${'a'.repeat(3800)}"target"${'b'.repeat(400)}`;
    const start = text.indexOf('"target"');

    const { container } = render(
      <LargeRawReadonlyViewer
        ref={ref}
        text={text}
        isDarkMode={false}
        highlightRange={{ start, end: start + '"target"'.length }}
      />
    );

    ref.current?.revealRange(start, start + '"target"'.length);

    await waitFor(() => {
      expect(container.querySelector('.large-raw-viewer')?.scrollLeft).toBeGreaterThan(0);
    });
  });

  it('uses the rendered highlight position to correct long-line horizontal reveal', async () => {
    const ref = createRef<LargeRawReadonlyViewerHandle>();
    const text = `${'a'.repeat(10)}"target"${'b'.repeat(4000)}`;
    const start = text.indexOf('"target"');

    const { container } = render(
      <LargeRawReadonlyViewer
        ref={ref}
        text={text}
        isDarkMode={false}
        highlightRange={{ start, end: start + '"target"'.length }}
      />
    );

    const viewer = container.querySelector('.large-raw-viewer') as HTMLElement;
    const highlight = container.querySelector('[data-large-raw-highlight="true"]') as HTMLElement;
    viewer.getBoundingClientRect = () => makeRect(0, 500);
    highlight.getBoundingClientRect = () => makeRect(900, 960);

    ref.current?.revealRange(start, start + '"target"'.length);

    await waitFor(() => {
      expect(viewer.scrollLeft).toBeGreaterThan(400);
    });
  });

  it('splits formatted raw JSON into virtual rows without embedded newlines', () => {
    const text = ['{', '  "name": "alpha",', '  "items": [', '    1,', '    2', '  ]', '}'].join('\n');

    render(<LargeRawReadonlyViewer text={text} isDarkMode={false} highlightRange={null} />);

    const rowTexts = Array.from(document.querySelectorAll('.large-raw-text'));
    expect(rowTexts.length).toBeGreaterThan(1);
    rowTexts.forEach((rowText) => {
      expect(rowText.textContent).not.toContain('\n');
    });
  });

  it('matches Monaco syntax colors and keeps continuation chunks on the original logical line', () => {
    const text = `{"name":"${'x'.repeat(4500)}","active":true}`;
    const data = buildLargeRawViewerData(text);

    const { container } = render(
      <LargeRawReadonlyViewer text={text} data={data} isDarkMode={false} highlightRange={null} />
    );

    expect(container.querySelector('.large-json-token-key')?.textContent).toBe('"name"');
    expect(container.querySelectorAll('.large-json-token-string').length).toBeGreaterThan(1);
    expect(container.querySelectorAll('.large-json-token-literal').length).toBe(1);
    expect(Array.from(container.querySelectorAll('.large-raw-offset')).map((node) => node.textContent)).toEqual([
      '1',
      '',
      '',
    ]);
  });

  it('renders cached literal-string rows in dark mode and exposes keyboard focus', () => {
    const ref = createRef<LargeRawReadonlyViewerHandle>();
    const text = JSON.stringify('escaped text');
    const data = buildEscapedStringLiteralRawViewerData(text.length);
    const { container } = render(
      <LargeRawReadonlyViewer ref={ref} text={text} data={data} isDarkMode highlightRange={null} />
    );

    ref.current?.focus();

    const viewer = container.querySelector('.large-raw-viewer');
    expect(viewer).toHaveClass('dark');
    expect(viewer).toHaveFocus();
    expect(container.querySelector('.large-json-token-string')).toHaveTextContent(text);
  });

  it('coalesces native scroll updates into the virtual viewport frame', () => {
    const text = Array.from({ length: 200 }, (_, index) => `{"line":${index}}`).join('\n');
    const { container } = render(<LargeRawReadonlyViewer text={text} isDarkMode={false} highlightRange={null} />);
    const viewer = container.querySelector('.large-raw-viewer') as HTMLElement;

    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    try {
      fireEvent.scroll(viewer, { target: { scrollTop: 1000 } });
      fireEvent.scroll(viewer, { target: { scrollTop: 1200 } });
      expect(requestFrame).toHaveBeenCalledOnce();
      expect(container.querySelector('.large-raw-row')).toHaveStyle({ top: '0px' });
      act(() => frames[0](16));
      const firstVisibleRow = Math.floor(1200 / JSON_EDITOR_LINE_HEIGHT) - 20;
      expect(container.querySelector('.large-raw-row')).toHaveStyle({
        top: `${firstVisibleRow * JSON_EDITOR_LINE_HEIGHT}px`,
      });
    } finally {
      requestFrame.mockRestore();
    }
  });
});
