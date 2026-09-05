import { afterEach, describe, expect, it, vi } from 'vitest';
import { readImportedFile } from './readImportedFile';

describe('abortable browser file reads', () => {
  afterEach(() => vi.restoreAllMocks());
  it('reads unicode JSON', async () => {
    expect(await readImportedFile(new File(['{"value":"你好🌍"}'], 'sample.json'), new AbortController().signal)).toBe(
      '{"value":"你好🌍"}'
    );
  });
  it('does not start an already cancelled read', async () => {
    const controller = new AbortController();
    controller.abort();
    const read = vi.spyOn(FileReader.prototype, 'readAsText');
    await expect(readImportedFile(new File([], 'x.json'), controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(read).not.toHaveBeenCalled();
  });
  it('actually aborts a pending FileReader and removes its listeners', async () => {
    let reader: FileReader | undefined;
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      reader = this;
    });
    const abort = vi.spyOn(FileReader.prototype, 'abort');
    const controller = new AbortController();
    const result = readImportedFile(new File([], 'x.json'), controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(abort).toHaveBeenCalledTimes(1);
    expect(reader?.onload).toBeNull();
    expect(reader?.onerror).toBeNull();
    expect(reader?.onabort).toBeNull();
  });
  it.each(['error', 'abort', 'throw'])('settles on reader %s', async (mode) => {
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      if (mode === 'throw') throw new Error('read failed');
      this.dispatchEvent(new ProgressEvent(mode));
    });
    await expect(readImportedFile(new File([], 'x.json'), new AbortController().signal)).rejects.toThrow();
  });
});
