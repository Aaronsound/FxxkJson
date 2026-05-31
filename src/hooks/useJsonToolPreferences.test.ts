import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LANGUAGE_STORAGE_KEY } from '../utils/i18n';
import { useJsonToolPreferences } from './useJsonToolPreferences';

describe('useJsonToolPreferences', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('persists language and performance panel visibility', () => {
    const { result } = renderHook(() => useJsonToolPreferences());

    act(() => {
      result.current.setLanguage('en');
      result.current.setShowPerformancePanel(false);
      result.current.setWrapLongLines(true);
    });

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(window.localStorage.getItem('fxxkjson.performancePanel.visible.v2')).toBe('false');
    expect(document.documentElement.lang).toBe('en');
    expect(result.current.wrapLongLines).toBe(true);
  });
});
