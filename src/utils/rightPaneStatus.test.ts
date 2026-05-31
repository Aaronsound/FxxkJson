// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createTranslator } from './i18n';
import { getRightPaneStatusText } from './rightPaneStatus';

const baseArgs = {
  canEnableLargeFileLocate: true,
  canUseRightPaneFolding: true,
  currentStructureStatus: 'ready' as const,
  isLargeFileLocateEnabled: true,
  isLargeFileMode: false,
  t: createTranslator('zh'),
  usesDedicatedRightViewer: false,
  usesLightweightLocate: false,
};

describe('getRightPaneStatusText', () => {
  it('shows folding support for non-large JSON that can use right pane folding', () => {
    expect(getRightPaneStatusText(baseArgs)).toBe('支持折叠');
  });

  it('hides the status for non-large JSON when folding is unavailable', () => {
    expect(
      getRightPaneStatusText({
        ...baseArgs,
        canUseRightPaneFolding: false,
      })
    ).toBeNull();
  });

  it('shows disabled locate status for large JSON without content', () => {
    expect(
      getRightPaneStatusText({
        ...baseArgs,
        canEnableLargeFileLocate: false,
        isLargeFileMode: true,
      })
    ).toBe('定位已关闭');
  });

  it('shows building status for structure-backed locate', () => {
    expect(
      getRightPaneStatusText({
        ...baseArgs,
        currentStructureStatus: 'building',
        isLargeFileMode: true,
      })
    ).toBe('定位索引中');
  });

  it('shows lightweight locate status when large JSON skips the full structure index', () => {
    expect(
      getRightPaneStatusText({
        ...baseArgs,
        currentStructureStatus: 'ready',
        isLargeFileMode: true,
        usesLightweightLocate: true,
      })
    ).toBe('轻量定位已启用');
  });

  it('keeps folding visible in status for the dedicated right viewer', () => {
    expect(
      getRightPaneStatusText({
        ...baseArgs,
        isLargeFileLocateEnabled: false,
        isLargeFileMode: true,
        usesDedicatedRightViewer: true,
      })
    ).toBe('轻量折叠 · 定位未启用');
  });

  it('uses localized text for English pane status labels', () => {
    expect(getRightPaneStatusText({
      ...baseArgs,
      isLargeFileLocateEnabled: false,
      isLargeFileMode: true,
      t: createTranslator('en'),
      usesDedicatedRightViewer: true,
    })).toBe('Light folding · Locate not enabled');
  });
});
