// @vitest-environment node
import { mkdtemp, readFile, readdir, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateJsonSaveRequest, writeJsonFileAtomically } from './saveJsonFile';

describe('native JSON save', () => {
  it('validates untrusted payloads and removes cross-platform path characters', () => {
    for (const value of [null, 'text', {}, { name: 'x', text: 1 }])
      expect(() => validateJsonSaveRequest(value)).toThrow();
    expect(validateJsonSaveRequest({ name: '../C:\\file.json', text: 'invalid is valid raw text' })).toEqual({
      name: '..-C--file.json',
      text: 'invalid is valid raw text',
    });
  });
  it('writes exact UTF-8, replaces complete files and cleans its own failed temporary file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'fxxkjson-save-test-'));
    try {
      const file = path.join(directory, '中文 file.json');
      const text = '{"id":9007199254740993,"中文":"😀"}\r\n';
      await writeJsonFileAtomically(file, text);
      expect(await readFile(file, 'utf8')).toBe(text);
      await writeJsonFileAtomically(file, '{broken');
      expect(await readFile(file, 'utf8')).toBe('{broken');
      const blocked = path.join(directory, 'directory');
      await mkdir(blocked);
      await expect(writeJsonFileAtomically(blocked, 'must not replace a directory')).rejects.toThrow();
      expect((await readdir(directory)).sort()).toEqual(['directory', '中文 file.json']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
