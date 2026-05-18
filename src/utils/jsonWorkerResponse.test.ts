// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { WorkerMessage } from '../types/jsonTool';
import { getFormatWorkerResult, getRepairWorkerResult } from './jsonWorkerResponse';

describe('jsonWorkerResponse', () => {
  it('normalizes format results', () => {
    const message = {
      success: true,
      data: '{\n  "ok": true\n}',
    } as WorkerMessage;

    const result = getFormatWorkerResult(message, (value) => value.data ?? null);

    expect(result).toMatchObject({
      error: null,
      formattedText: '{\n  "ok": true\n}',
      isSuccessful: true,
      rawViewerData: null,
    });
  });

  it('normalizes repair results with both text payloads', () => {
    const message = {
      success: true,
      data: '{\n  "ok": true\n}',
      repairedText: '{"ok":true}',
    } as WorkerMessage;

    const result = getRepairWorkerResult(
      message,
      (value) => value.data ?? null,
      (value) => value.repairedText ?? null
    );

    expect(result).toMatchObject({
      formattedText: '{\n  "ok": true\n}',
      isSuccessful: true,
      repairedText: '{"ok":true}',
    });
  });

  it('keeps failed responses explicit', () => {
    const message = {
      success: false,
      error: 'bad json',
    } as WorkerMessage;

    const result = getFormatWorkerResult(message, () => null);

    expect(result.error).toBe('bad json');
    expect(result.isSuccessful).toBe(false);
  });
});
