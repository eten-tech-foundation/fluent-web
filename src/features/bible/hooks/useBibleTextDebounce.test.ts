import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerseMarkers } from '@/lib/types';

import { useBibleTextDebounce } from './useBibleTextDebounce';

const OPENING: VerseMarkers = { paragraphs: [{ marker: 'p', offset: 0 }] };
const SPLIT: VerseMarkers = {
  paragraphs: [
    { marker: 'p', offset: 0 },
    { marker: 'p', offset: 12 },
  ],
};

describe('useBibleTextDebounce with markers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves a markers-only change so a new paragraph reaches the server', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBibleTextDebounce({ onSave, debounceMs: 10 }));

    result.current.setInitialContent(1, { content: 'abc', markers: null });
    result.current.debouncedSave(1, { content: 'abc', markers: OPENING });
    await vi.advanceTimersByTimeAsync(20);

    expect(onSave).toHaveBeenCalledWith(1, { content: 'abc', markers: OPENING });
  });

  it('dedupes a save whose content and markers both match the last one', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBibleTextDebounce({ onSave, debounceMs: 10 }));

    result.current.setInitialContent(1, { content: 'abc', markers: OPENING });
    result.current.debouncedSave(1, {
      content: 'abc',
      markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
    });
    await vi.advanceTimersByTimeAsync(20);

    expect(onSave).not.toHaveBeenCalled();
  });

  it('reports unsaved changes when only the markers moved', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBibleTextDebounce({ onSave }));

    result.current.setInitialContent(1, { content: 'abc', markers: null });
    result.current.debouncedSave(1, { content: 'abc', markers: OPENING });

    expect(result.current.getSaveStatus(1).hasUnsavedChanges).toBe(true);
  });

  it('retries a failed save with its markers intact', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBibleTextDebounce({ onSave, debounceMs: 10, retryDelayMs: 50 })
    );

    await expect(
      result.current.saveImmediately(1, { content: 'Starts here and continues.', markers: SPLIT })
    ).rejects.toThrow('offline');
    await vi.advanceTimersByTimeAsync(60);

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(1, {
      content: 'Starts here and continues.',
      markers: SPLIT,
    });
  });
});
