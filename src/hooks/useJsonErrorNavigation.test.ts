import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useJsonErrorNavigation } from './useJsonErrorNavigation';

describe('error navigation', () => {
  function setup() {
    return {
      activeTabId: 'a',
      rawRevision: 2,
      error: 'invalid JSON',
      location: { offset: 4, length: 1, line: 1, column: 5, rawRevision: 2 },
      getRawRevision: vi.fn(() => 2),
      getTabContent: vi.fn(() => '[1, ]'),
      revealLeftRange: vi.fn(),
      clearLeftHighlights: vi.fn(),
      focusLeft: vi.fn(),
    };
  }
  it('navigates only on click without changing text, and clears marks when edited', () => {
    const props = setup();
    const { result, rerender } = renderHook(useJsonErrorNavigation, { initialProps: props });
    expect(props.revealLeftRange).not.toHaveBeenCalled();
    act(() => result.current.handleLocateError());
    expect(props.revealLeftRange).toHaveBeenCalledWith(4, 5);
    expect(props.focusLeft).toHaveBeenCalledOnce();
    rerender({ ...props, rawRevision: 3 });
    expect(result.current.currentErrorLocation).toBeUndefined();
    expect(props.clearLeftHighlights).toHaveBeenCalledOnce();
    act(() => result.current.handleLocateError());
    expect(props.revealLeftRange).toHaveBeenCalledOnce();
  });
  it('rejects stale clicks and clears markers on tab changes or successful formatting', () => {
    const props = setup();
    const { result, rerender, unmount } = renderHook(useJsonErrorNavigation, { initialProps: props });
    props.getRawRevision.mockReturnValue(3);
    act(() => result.current.handleLocateError());
    expect(props.revealLeftRange).not.toHaveBeenCalled();
    props.getRawRevision.mockReturnValue(2);
    act(() => result.current.handleLocateError());
    rerender({ ...props, activeTabId: 'b' });
    expect(props.clearLeftHighlights).toHaveBeenCalledOnce();
    rerender({ ...props, error: '' });
    expect(result.current.currentErrorLocation).toBeUndefined();
    unmount();
  });
});
