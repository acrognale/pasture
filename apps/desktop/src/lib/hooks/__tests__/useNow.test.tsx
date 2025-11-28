import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useNow } from '../useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-11-28T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('updates the current time on the provided interval', () => {
    const { result, unmount } = renderHook(() => useNow(1_000));

    const first = result.current.getTime();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current.getTime()).toBeGreaterThan(first);

    unmount();
  });
});
