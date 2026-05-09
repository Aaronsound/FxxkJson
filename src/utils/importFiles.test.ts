import { describe, expect, it } from 'vitest';
import { getFirstJsonImportFile, isJsonImportFile } from './importFiles';

function fileLike(name: string, type = '') {
  return { name, type } as File;
}

describe('importFiles', () => {
  it('accepts JSON and text files by extension or mime type', () => {
    expect(isJsonImportFile(fileLike('data.json'))).toBe(true);
    expect(isJsonImportFile(fileLike('notes.txt'))).toBe(true);
    expect(isJsonImportFile(fileLike('payload', 'application/json'))).toBe(true);
    expect(isJsonImportFile(fileLike('image.png', 'image/png'))).toBe(false);
  });

  it('picks the first importable file from a dropped file list', () => {
    const files = [
      fileLike('screenshot.png', 'image/png'),
      fileLike('payload.json', 'application/octet-stream'),
      fileLike('other.txt', 'text/plain'),
    ];

    expect(getFirstJsonImportFile(files)?.name).toBe('payload.json');
  });
});
