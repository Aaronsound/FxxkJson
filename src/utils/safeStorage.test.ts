import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStorageItem, readStorageJson, writeStorageItem } from './safeStorage';

describe('safeStorage', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads and writes storage values', () => {
    writeStorageItem('key', 'value');

    expect(readStorageItem('key')).toBe('value');
  });

  it('falls back when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    writeStorageItem('key', 'value');

    expect(readStorageItem('key')).toBeNull();
    expect(readStorageJson('key', ['fallback'])).toEqual(['fallback']);
  });

  it('falls back for malformed JSON', () => {
    window.localStorage.setItem('key', '{bad');

    expect(readStorageJson('key', { ok: true })).toEqual({ ok: true });
  });
});
