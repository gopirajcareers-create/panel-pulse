import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useL2Validation } from '../use-l2-validation';

describe('useL2Validation', () => {
  it('initializes with null result and no error', () => {
    const { result } = renderHook(() => useL2Validation());
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('clears result and error on clearResult', async () => {
    const { result } = renderHook(() => useL2Validation());

    act(() => {
      result.current.clearResult();
    });

    await waitFor(() => {
      expect(result.current.result).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  it('returns null if transcript or rejection reason is missing', async () => {
    const { result } = renderHook(() => useL2Validation());
    const validationResult = await result.current.validateL2Reason('', '');

    await waitFor(() => {
      expect(validationResult).toBeNull();
      expect(result.current.error).toBeTruthy();
    });
  });
});
