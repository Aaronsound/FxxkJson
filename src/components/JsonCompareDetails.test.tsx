import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonCompareDetails } from './JsonCompareDetails';
import { DIFF_VALUE_CHUNK_SIZE, type JsonDiffEntry, type JsonDiffValue } from '../utils/jsonDiff';
import { createTranslator } from '../utils/i18n';
import { writeTextToClipboard } from '../utils/clipboard';

vi.mock('../utils/clipboard', () => ({ writeTextToClipboard: vi.fn() }));
const diff: JsonDiffEntry = {
  type: 'changed',
  path: ['message'],
  pathText: '$.message',
  leftPreview: '',
  rightPreview: '',
};
const t = createTranslator('zh');
const text = JSON.stringify('你好🌍'.repeat(10000) + 'END');
const value = (offset = 0, full = false): JsonDiffValue => ({
  text: full ? text : text.slice(offset, offset + DIFF_VALUE_CHUNK_SIZE),
  total: text.length,
  missing: false,
  offset,
});

describe('full difference values', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });
  it('pages through long values and copies the full value, not the visible section', async () => {
    const getValue = vi.fn(async (_path, _side, offset, full = false) => value(offset, full));
    const close = vi.fn();
    render(<JsonCompareDetails diff={diff} getValue={getValue} t={t} onClose={close} />);
    const left = within(screen.getByRole('region', { name: '左侧值' }));
    await left.findByText(/第 1–16384 字符/);
    fireEvent.click(left.getByRole('button', { name: '下一段' }));
    await left.findByText(/第 16385–32768 字符/);
    fireEvent.click(left.getByRole('button', { name: '上一段' }));
    await left.findByText(/第 1–16384 字符/);
    fireEvent.click(left.getByRole('button', { name: '最后一段' }));
    await left.findByText(/END"$/);
    expect(left.getByRole('button', { name: '下一段' })).toBeDisabled();
    fireEvent.click(left.getByRole('button', { name: '复制完整值' }));
    await left.findByText('完整值已复制');
    expect(writeTextToClipboard).toHaveBeenCalledWith(text);
    expect(getValue).toHaveBeenCalledWith(diff.path, 'left', 0, true);
    fireEvent.click(screen.getByRole('button', { name: '返回差异列表' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('marks missing values distinctly and disables copying them', async () => {
    render(
      <JsonCompareDetails
        diff={diff}
        getValue={async () => ({ text: '', total: 0, offset: 0, missing: true })}
        t={t}
        onClose={vi.fn()}
      />
    );
    expect(await screen.findAllByText('此侧不存在该值')).toHaveLength(2);
    for (const button of screen.getAllByRole('button', { name: '复制完整值' })) expect(button).toBeDisabled();
  });
  it('reports load and clipboard errors', async () => {
    const getValue = vi.fn().mockRejectedValueOnce(new Error('read failed')).mockResolvedValue(value());
    vi.mocked(writeTextToClipboard).mockRejectedValue(new Error('clipboard failed'));
    render(<JsonCompareDetails diff={diff} getValue={getValue} t={t} onClose={vi.fn()} />);
    await screen.findByText(/read failed/);
    const right = within(screen.getByRole('region', { name: '右侧值' }));
    await right.findByText(/第 1–16384 字符/);
    fireEvent.click(right.getByRole('button', { name: '复制完整值' }));
    await right.findByText(/clipboard failed/);
  });
  it('does not write a late clipboard result after the details have closed', async () => {
    let finish: ((value: JsonDiffValue) => void) | undefined;
    const getValue = vi.fn((_path, _side, _offset, full = false) =>
      full
        ? new Promise<JsonDiffValue>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(value())
    );
    const { unmount } = render(<JsonCompareDetails diff={diff} getValue={getValue} t={t} onClose={vi.fn()} />);
    const left = within(screen.getByRole('region', { name: '左侧值' }));
    await left.findByText(/第 1–16384 字符/);
    fireEvent.click(left.getByRole('button', { name: '复制完整值' }));
    unmount();
    await act(async () => finish?.(value(0, true)));
    expect(writeTextToClipboard).not.toHaveBeenCalled();
  });
});
