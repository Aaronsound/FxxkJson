import { describe, expect, it } from 'vitest';
import { createClosedTabHistory } from './closedTabHistory';

describe('closed tab history', () => {
  it('restores exact drafts and names last closed first, without retaining empty tabs', () => {
    const history = createClosedTabHistory();
    const draft = { title: '草稿/中文', text: '{"id":9007199254740993,\r\n' };
    history.push(draft);
    history.push({ title: 'empty', text: '' });
    history.push({ title: 'b', text: 'true' });
    expect(history.pop()).toEqual({ title: 'b', text: 'true' });
    expect(history.pop()).toBe(draft);
    expect(history.bytes).toBe(0);
    expect(history.pop()).toBeUndefined();
  });
  it('evicts oldest entries by count and conservative text memory', () => {
    const history = createClosedTabHistory(2, 20);
    history.push({ title: 'a', text: '123' });
    history.push({ title: 'b', text: '123' });
    history.push({ title: 'c', text: '12345' });
    expect(history.size).toBe(2);
    expect(history.bytes).toBe(20);
    expect(history.pop()?.title).toBe('c');
    expect(history.pop()?.title).toBe('b');
    const countBound = createClosedTabHistory(1);
    countBound.push({ title: 'a', text: '{}' });
    countBound.push({ title: 'b', text: '{}' });
    expect(countBound.size).toBe(1);
  });
  it('does not offer an older document when the latest exceeds the budget', () => {
    const history = createClosedTabHistory(10, 10);
    history.push({ title: 'a', text: '{}' });
    history.push({ title: 'large', text: 'abcdef' });
    expect(history.size).toBe(0);
    expect(history.bytes).toBe(0);
  });
});
