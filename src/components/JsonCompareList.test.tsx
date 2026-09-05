import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonCompareList } from './JsonCompareList';
import { createTranslator } from '../utils/i18n';
import type { JsonDiffEntry } from '../utils/jsonDiff';

const diffs: JsonDiffEntry[] = Array.from({ length: 2000 }, (_, i) => ({
  type: 'changed',
  path: [i],
  pathText: `$[${i}]`,
  leftPreview: '0',
  rightPreview: '1',
}));
const t = createTranslator('zh');
const props = { diffs, hidden: false, startIndex: 0, onSelect: vi.fn(), t };
afterEach(cleanup);

describe('virtual comparison list', () => {
  it('bounds DOM rows while allowing access to the middle and final result', async () => {
    render(<JsonCompareList {...props} />);
    const list = screen.getByRole('table');
    expect(list).toHaveAttribute('aria-rowcount', '2001');
    expect(document.querySelectorAll('.json-compare-row').length).toBeLessThan(60);
    fireEvent.scroll(list, { target: { scrollTop: 64032 } });
    await screen.findByText('$[1000]');
    expect(screen.queryByText('$[0]')).not.toBeInTheDocument();
    fireEvent.scroll(list, { target: { scrollTop: 128000 } });
    await screen.findByText('$[1999]');
    expect(document.querySelectorAll('.json-compare-row').length).toBeLessThan(60);
  });
  it('restores both scroll axes and the opener after details, excluding hidden buttons', async () => {
    const { rerender } = render(<JsonCompareList {...props} />);
    const list = screen.getByRole('table');
    fireEvent.scroll(list, { target: { scrollTop: 6432, scrollLeft: 80 } });
    await screen.findByText('$[100]');
    const button = screen.getByRole('button', { name: '查看 $[100] 的完整值' });
    // Open details before the queued scroll frame runs.
    fireEvent.scroll(list, { target: { scrollTop: 6433, scrollLeft: 80 } });
    fireEvent.click(button);
    rerender(<JsonCompareList {...props} hidden />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(list.querySelector('button:not(:disabled)')).toBeNull();
    list.scrollTop = 0;
    list.scrollLeft = 0;
    rerender(<JsonCompareList {...props} />);
    expect(list.scrollTop).toBe(6433);
    expect(list.scrollLeft).toBe(80);
    expect(button).toHaveFocus();
  });
  it('keeps Tab and Shift+Tab working across unmounted blocks', async () => {
    render(<JsonCompareList {...props} />);
    const button = screen.getByRole('button', { name: '查看 $[19] 的完整值' });
    act(() => button.focus());
    fireEvent.keyDown(button, { key: 'Tab' });
    await waitFor(() => expect(screen.getByRole('button', { name: '查看 $[20] 的完整值' })).toHaveFocus());
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab', shiftKey: true });
    expect(button).toHaveFocus();
  });
});
