import { describe, expect, it, vi } from 'vitest';
import { createJsonImportTasks } from './jsonImportTasks';

describe('import task cancellation', () => {
  it('aborts replaced reads before beginning another task and ignores old finishes', () => {
    const tasks = createJsonImportTasks();
    const first = tasks.begin('a');
    const abort = vi.fn(() => expect(first.isCurrent()).toBe(false));
    first.signal.addEventListener('abort', abort);
    const second = tasks.begin('a');
    expect(abort).toHaveBeenCalledTimes(1);
    expect(first.signal.aborted).toBe(true);
    first.finish();
    expect(second.isCurrent()).toBe(true);
    tasks.cancel('a');
    expect(second.signal.aborted).toBe(true);
    tasks.cancel('a');
  });
  it('aborts every remaining read on disposal, but does not abort finished reads', () => {
    const tasks = createJsonImportTasks();
    const finished = tasks.begin('a');
    finished.finish();
    const b = tasks.begin('b');
    const c = tasks.begin('c');
    tasks.clear();
    expect(finished.signal.aborted).toBe(false);
    expect(b.signal.aborted).toBe(true);
    expect(c.signal.aborted).toBe(true);
    expect(c.isCurrent()).toBe(false);
  });
});
