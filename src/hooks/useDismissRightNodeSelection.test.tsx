import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDismissRightNodeSelection } from './useDismissRightNodeSelection';

function Harness({ onDismiss }: { onDismiss: (tabId: string) => void }) {
  useDismissRightNodeSelection({
    activeTabId: 'tab-1',
    hasSelection: true,
    onDismiss,
  });

  return (
    <>
      <div className="right-editor-pane">
        <div className="editor-pane-content" data-testid="right-content" />
      </div>
      <div className="large-json-context-menu" data-testid="context-menu" />
      <button type="button" data-testid="outside">
        outside
      </button>
    </>
  );
}

describe('useDismissRightNodeSelection', () => {
  it('clears the selected node only when clicking outside the formatted pane and its context menu', () => {
    const onDismiss = vi.fn();
    const { getByTestId } = render(<Harness onDismiss={onDismiss} />);

    fireEvent.pointerDown(getByTestId('right-content'));
    fireEvent.pointerDown(getByTestId('context-menu'));
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.pointerDown(getByTestId('outside'));
    expect(onDismiss).toHaveBeenCalledWith('tab-1');
  });
});
