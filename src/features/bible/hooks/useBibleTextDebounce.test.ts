import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerseMarkers } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { useBibleTextDebounce } from './useBibleTextDebounce';

const OPENING: VerseMarkers = { paragraphs: [{ marker: 'p', offset: 0 }] };
const SPLIT: VerseMarkers = {
  paragraphs: [
    { marker: 'p', offset: 0 },
    { marker: 'p', offset: 12 },
  ],
};

describe('useBibleTextDebounce with markers', () => {
  it('saves title-only edits, level changes, reordering and removal', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBibleTextDebounce({ onSave, debounceMs: 10 }));
    const first = { marker: 's1', text: 'First heading' };
    const second = { marker: 's2', text: 'Second heading' };
    result.current.setInitialContent(1, {
      content: 'Verse.',
      markers: { headings: [first, second] },
    });
    for (const headings of [
      [{ ...first, text: 'Edited heading' }, second],
      [{ ...first, marker: 's3' }, second],
      [second, first],
      undefined,
    ]) {
      const payload = { content: 'Verse.', markers: headings ? { headings } : null };
      result.current.debouncedSave(1, payload);
      expect(result.current.getSaveStatus(1).hasUnsavedChanges).toBe(true);
      await vi.advanceTimersByTimeAsync(20);
      expect(onSave).toHaveBeenLastCalledWith(1, payload);
      expect(result.current.getSaveStatus(1).hasUnsavedChanges).toBe(false);
    }
    expect(onSave).toHaveBeenCalledTimes(4);
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    useAppStore.getState().setRoleChangeWarning(false);
  });

  it('keeps two debounced saves in order when the first request is delayed', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const persisted: string[] = [];
    const onSave = vi.fn(async (_verse: number, payload: { content: string }) => {
      if (payload.content === 'Older edit') await pending;
      persisted.push(payload.content);
    });
    const { result } = renderHook(() => useBibleTextDebounce({ onSave, debounceMs: 10 }));
    result.current.setInitialContent(1, { content: 'Initial' });
    result.current.debouncedSave(1, { content: 'Older edit' });
    await vi.advanceTimersByTimeAsync(20);
    result.current.debouncedSave(1, { content: 'Latest edit' });
    await vi.advanceTimersByTimeAsync(20);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(persisted).toEqual(['Older edit', 'Latest edit']);
    expect(result.current.getSaveStatus(1).hasUnsavedChanges).toBe(false);
  });

  it('persists a revert to the initial content after a pending older write', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const persisted: string[] = [];
    const onSave = vi.fn(async (_verse: number, payload: { content: string }) => {
      if (payload.content === 'Older edit') await pending;
      persisted.push(payload.content);
    });
    const { result } = renderHook(() => useBibleTextDebounce({ onSave, debounceMs: 10 }));
    result.current.setInitialContent(1, { content: 'Initial' });
    result.current.debouncedSave(1, { content: 'Older edit' });
    await vi.advanceTimersByTimeAsync(20);
    result.current.debouncedSave(1, { content: 'Initial' });
    await vi.advanceTimersByTimeAsync(20);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(persisted).toEqual(['Older edit', 'Initial']);
  });

  it('clears saving status when an immediate save has no changes', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useBibleTextDebounce({ onSave }));
    result.current.setInitialContent(1, { content: 'Initial' });
    await result.current.saveImmediately(1, { content: 'Initial' });
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.getSaveStatus(1).isActivelySaving).toBe(false);
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

  it('cancels pending saves and skips new saves when a 403 permission error occurs', async () => {
    const forbiddenError = new Error('Forbidden');
    (forbiddenError as { status?: number }).status = 403;
    const onSave = vi.fn().mockRejectedValueOnce(forbiddenError);

    const { result } = renderHook(() =>
      useBibleTextDebounce({ onSave, debounceMs: 50, retryDelayMs: 100 })
    );

    result.current.setInitialContent(1, { content: 'Original', markers: null });
    result.current.debouncedSave(1, { content: 'Modified', markers: null });

    // Advance timer to trigger first save, which fails with 403
    await vi.advanceTimersByTimeAsync(60);
    expect(onSave).toHaveBeenCalledTimes(1);

    // Further debouncedSave calls should be ignored
    result.current.debouncedSave(1, { content: 'Another edit', markers: null });
    await vi.advanceTimersByTimeAsync(200);

    // onSave should not have been called again (no retries, no new saves)
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('flushes the latest pending markers on unmount without a duplicate debounce save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useBibleTextDebounce({ onSave }));
    result.current.setInitialContent(1, { content: 'Verse', markers: null });
    result.current.debouncedSave(1, { content: 'Verse', markers: OPENING });
    result.current.debouncedSave(1, { content: 'Verse', markers: SPLIT });

    unmount();
    await vi.advanceTimersByTimeAsync(12000);

    expect(onSave).toHaveBeenCalledExactlyOnceWith(1, { content: 'Verse', markers: SPLIT });
  });

  it.each([401, 403, 404])('does not retry a %s response to an unmount flush', async status => {
    const onSave = vi.fn().mockRejectedValue({ status });
    const { result, unmount } = renderHook(() => useBibleTextDebounce({ onSave }));
    result.current.debouncedSave(1, { content: 'Unsaved verse', markers: OPENING });

    unmount();
    await vi.advanceTimersByTimeAsync(20000);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().roleChangeWarning).toBe(true);
  });
});
