import React, { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LargeRawReadonlyViewer, {
  LargeRawReadonlyViewerHandle,
} from './LargeRawReadonlyViewer';

describe('LargeRawReadonlyViewer', () => {
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
});
