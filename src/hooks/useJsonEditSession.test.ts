import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useJsonEditSession } from './useJsonEditSession';

afterEach(cleanup);
describe('useJsonEditSession validation', () => {
  it('keeps raw edits on failed validation and clears locations across editing sessions', () => {
    const { result } = renderHook(() => useJsonEditSession());
    const location = { offset: 7, length: 3, line: 1, column: 8, rawRevision: 1 };
    act(() => result.current.openDocumentEditSession('{"a":1 "b":2}', location));
    expect(result.current.editJsonSession?.rawSource).toBe(true);
    expect(result.current.editJsonErrorLocation).toEqual(location);
    const session = result.current.editJsonSession;
    act(() => {
      result.current.editJsonValueRef.current = '{"a":12 "b":2}';
      result.current.setEditJsonError('invalid', { ...location, offset: 8, column: 9 });
    });
    expect(result.current.editJsonSession).toBe(session);
    expect(result.current.editJsonValueRef.current).toBe('{"a":12 "b":2}');
    act(() => result.current.setEditJsonError(null));
    expect(result.current.editJsonErrorLocation).toBeUndefined();
    act(() => result.current.openNodeEditSession('{}', ['node']));
    expect(result.current.editJsonSession?.rawSource).toBeUndefined();
    expect(result.current.editJsonErrorLocation).toBeUndefined();
    act(() => result.current.closeEditJson());
    expect(result.current.editJsonSession).toBeNull();
  });
});
