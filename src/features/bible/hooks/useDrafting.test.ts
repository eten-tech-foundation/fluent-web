import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Source, TargetVerse, VerseMarkers } from '@/lib/types';

import { useDrafting } from './useDrafting';

import type { SavePayload } from './useBibleTextDebounce';

const SPLIT: VerseMarkers = {
  paragraphs: [
    { marker: 'p', offset: 0 },
    { marker: 'p', offset: 12 },
  ],
};

const SOURCES: Source[] = [
  { id: 1, verseNumber: 1, text: 'Source 1' },
  { id: 2, verseNumber: 2, text: 'Source 2' },
];

const TARGETS: TargetVerse[] = [
  { verseNumber: 1, content: 'Starts here and continues here.', markers: null },
  { verseNumber: 2, content: '', markers: null },
];

const draft = (onSave: (verse: number, payload: SavePayload) => Promise<void>) =>
  renderHook(() =>
    useDrafting({ sourceVerses: SOURCES, targetVerses: TARGETS, readOnly: false, onSave })
  );

describe('useDrafting with markers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the markers of an edit through the debounced save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = draft(onSave);

    act(() => {
      result.current.handleTextChange(1, 'Starts here and continues here.', SPLIT);
    });
    await act(() => vi.advanceTimersByTimeAsync(2500));

    expect(onSave).toHaveBeenCalledWith(1, {
      content: 'Starts here and continues here.',
      markers: SPLIT,
    });
  });

  it('flushes the stored markers when the active verse changes, not a wipe', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = draft(onSave);

    // The translator splits verse 1, then clicks into verse 2 before the debounce fires.
    act(() => {
      result.current.handleTextChange(1, 'Starts here and continues here.', SPLIT);
    });
    act(() => {
      result.current.handleActiveVerseChange(2);
    });
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(onSave).toHaveBeenCalledWith(1, {
      content: 'Starts here and continues here.',
      markers: SPLIT,
    });
  });

  it('leaves markers undefined for a textarea edit that never derived any', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = draft(onSave);

    act(() => {
      result.current.handleTextChange(2, 'Typed in the textarea.');
    });
    await act(() => vi.advanceTimersByTimeAsync(2500));

    expect(onSave).toHaveBeenCalledWith(2, {
      content: 'Typed in the textarea.',
      markers: undefined,
    });
  });
});
