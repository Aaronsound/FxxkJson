import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useJsonTabArtifacts } from './useJsonTabArtifacts';

describe('useJsonTabArtifacts', () => {
  it('initializes and removes every tab artifact together', () => {
    const { result } = renderHook(() => useJsonTabArtifacts('tab-a'));

    act(() => result.current.initializeTabArtifacts('tab-b'));
    expect(result.current.largeViewerDataByTab).toHaveProperty('tab-b', null);
    expect(result.current.largeRawViewerDataByTab).toHaveProperty('tab-b', null);
    expect(result.current.largeViewerStatusByTab).toHaveProperty('tab-b', 'idle');
    expect(result.current.processingStageByTab).toHaveProperty('tab-b', 'idle');
    expect(result.current.locateFeedbackByTab).toHaveProperty('tab-b', null);
    expect(result.current.rightNodeSelectionByTab).toHaveProperty('tab-b', null);

    act(() => result.current.removeTabArtifactsState('tab-b'));
    expect(result.current.largeViewerDataByTab).not.toHaveProperty('tab-b');
    expect(result.current.largeRawViewerDataByTab).not.toHaveProperty('tab-b');
    expect(result.current.largeViewerStatusByTab).not.toHaveProperty('tab-b');
    expect(result.current.processingStageByTab).not.toHaveProperty('tab-b');
    expect(result.current.locateFeedbackByTab).not.toHaveProperty('tab-b');
    expect(result.current.rightNodeSelectionByTab).not.toHaveProperty('tab-b');
  });

  it('keeps artifact actions stable when artifact state changes', () => {
    const { result } = renderHook(() => useJsonTabArtifacts('tab-a'));
    const initializeTabArtifacts = result.current.initializeTabArtifacts;
    const removeTabArtifactsState = result.current.removeTabArtifactsState;

    act(() => result.current.setLargeViewerStatusByTab((current) => ({ ...current, 'tab-a': 'building' })));

    expect(result.current.initializeTabArtifacts).toBe(initializeTabArtifacts);
    expect(result.current.removeTabArtifactsState).toBe(removeTabArtifactsState);
  });
});
