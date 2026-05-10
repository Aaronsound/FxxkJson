import { describe, expect, it } from 'vitest';
import {
  LARGE_FILE_THRESHOLD,
  STRUCTURE_SYNC_THRESHOLD,
} from '../types/jsonTool';
import {
  canUseStructureSync,
  getUtf8ByteLength,
  isLargeDocument,
  shouldBuildWorkerStructure,
  shouldUseLargeMode,
} from './jsonDocumentMetrics';

describe('jsonToolModels', () => {
  it('measures UTF-8 byte length instead of string length', () => {
    expect(getUtf8ByteLength('abc')).toBe(3);
    expect(getUtf8ByteLength('汉字')).toBe(6);
  });

  it('uses byte-based large document thresholds', () => {
    const belowThreshold = 'a'.repeat(LARGE_FILE_THRESHOLD - 1);
    const atThreshold = 'a'.repeat(LARGE_FILE_THRESHOLD);
    const aboveStructureThreshold = 'a'.repeat(STRUCTURE_SYNC_THRESHOLD + 1);

    expect(isLargeDocument(belowThreshold)).toBe(false);
    expect(isLargeDocument(atThreshold)).toBe(true);
    expect(canUseStructureSync(atThreshold)).toBe(true);
    expect(canUseStructureSync(aboveStructureThreshold)).toBe(false);
  });

  it('derives large mode from the current raw and formatted content only', () => {
    const small = '{"ok":true}';
    const large = 'a'.repeat(LARGE_FILE_THRESHOLD);

    expect(shouldUseLargeMode(small, small)).toBe(false);
    expect(shouldUseLargeMode(large, small)).toBe(true);
    expect(shouldUseLargeMode(small, large)).toBe(true);
  });

  it('only builds worker structure for supported document sizes', () => {
    const small = '{"ok":true}';
    const large = 'a'.repeat(LARGE_FILE_THRESHOLD);
    const nominalTwentyMbFixture = 'a'.repeat((20 * 1024 * 1024) + 191);
    const tooLarge = 'a'.repeat(STRUCTURE_SYNC_THRESHOLD + 1);

    expect(shouldBuildWorkerStructure('', false)).toBe(false);
    expect(shouldBuildWorkerStructure(small, false)).toBe(true);
    expect(shouldBuildWorkerStructure(large, false)).toBe(false);
    expect(shouldBuildWorkerStructure(large, true)).toBe(true);
    expect(shouldBuildWorkerStructure(nominalTwentyMbFixture, true)).toBe(true);
    expect(shouldBuildWorkerStructure(tooLarge, true)).toBe(false);
  });
});
