import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LargeRawReadonlyViewer, {
  areLargeRawReadonlyRowPropsEqual,
  type LargeRawReadonlyRowProps,
  type LargeRawReadonlyViewerHandle,
} from './LargeRawReadonlyViewer';
import { JSON_EDITOR_LINE_HEIGHT } from '../utils/jsonEditorTypography';

describe('LargeRawReadonlyViewer', () => {
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
      rowIndex: 0,
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
    const text = 'a'.repeat(4500) + '"target"' + 'b'.repeat(4500);
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
    const text = 'a'.repeat(3800) + '"target"' + 'b'.repeat(400);
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
});
