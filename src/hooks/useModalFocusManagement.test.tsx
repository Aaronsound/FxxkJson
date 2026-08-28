import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useModalFocusManagement } from './useModalFocusManagement';

function TestDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocusManagement(ref, onClose);
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

describe('useModalFocusManagement', () => {
  afterEach(cleanup);

  it('closes on Escape and keeps Tab focus inside the dialog', () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to the previously active control when unmounted', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<TestDialog onClose={vi.fn()} />);

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
