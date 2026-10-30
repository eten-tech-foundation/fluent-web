import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type VerseAudioRecording } from '@/lib/types';

import {
  isPericopeRecording,
  pericopeCoversVerse,
  resolvePericopeBounds,
  useStitchedAudio,
} from './useStitchedAudio';

describe('useStitchedAudio', () => {
  const makeRecording = (
    verseNumber: number,
    takes: Array<{ id: number; durationSeconds: number }>,
    activeTakeId: number | null,
    conflictStatus: 'clean' | 'conflict' | 'resolved' = 'clean'
  ): VerseAudioRecording => ({
    id: verseNumber,
    projectUnitId: 1,
    bibleTextId: verseNumber,
    uploadedBy: 1,
    contentType: 'audio/webm',
    sizeBytes: 1000,
    durationSeconds: takes.find(t => t.id === activeTakeId)?.durationSeconds ?? null,
    versionToken: 1,
    conflictStatus,
    activeTakeId,
    verseNumber,
    downloadUrl: `https://example.com/${verseNumber}.webm`,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    takes: takes.map(t => ({
      id: t.id,
      uploadedBy: 1,
      contentType: 'audio/webm',
      sizeBytes: 1000,
      durationSeconds: t.durationSeconds,
      contentHash: `hash-${t.id}`,
      downloadUrl: `https://example.com/take-${t.id}.webm`,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    })),
  });

  it('stitches active takes in sequential verse order when all verses are clean', () => {
    const recordings = [
      makeRecording(6, [{ id: 61, durationSeconds: 5 }], 61),
      makeRecording(7, [{ id: 71, durationSeconds: 6 }], 71),
      makeRecording(8, [{ id: 81, durationSeconds: 7 }], 81),
      makeRecording(9, [{ id: 91, durationSeconds: 8 }], 91),
    ];

    const { result } = renderHook(() =>
      useStitchedAudio({
        verseNumbers: [6, 7, 8, 9],
        recordings,
      })
    );

    expect(result.current.hasOnlyPerVerseRecordings).toBe(true);
    expect(result.current.hasActivePericopeTake).toBe(false);
    expect(result.current.skippedVerses).toEqual([]);
    expect(result.current.tracks).toHaveLength(4);
    expect(result.current.tracks.map(t => t.verseNumber)).toEqual([6, 7, 8, 9]);
    expect(result.current.tracks.map(t => t.takeId)).toEqual([61, 71, 81, 91]);
    expect(result.current.totalDuration).toBe(26);
  });

  it('skips verses in conflict and verses with no recording, matching the issue mockup', () => {
    // Verses 6-9:
    // Verse 6: conflict
    // Verse 7: no recording (missing from list)
    // Verse 8: active take 81 (10s)
    // Verse 9: active take 91 (13s)
    const recordings = [
      makeRecording(
        6,
        [
          { id: 61, durationSeconds: 4 },
          { id: 62, durationSeconds: 5 },
        ],
        null,
        'conflict'
      ),
      makeRecording(8, [{ id: 81, durationSeconds: 10 }], 81),
      makeRecording(9, [{ id: 91, durationSeconds: 13 }], 91),
    ];

    const { result } = renderHook(() =>
      useStitchedAudio({
        verseNumbers: [6, 7, 8, 9],
        recordings,
      })
    );

    expect(result.current.hasOnlyPerVerseRecordings).toBe(true);
    expect(result.current.hasActivePericopeTake).toBe(false);
    expect(result.current.tracks.map(t => t.verseNumber)).toEqual([8, 9]);
    expect(result.current.totalDuration).toBe(23); // 10 + 13 = 23s (matches mockup 0:23)

    expect(result.current.skippedVerses).toEqual([
      { verseNumber: 6, reason: 'conflict' },
      { verseNumber: 7, reason: 'no recording' },
    ]);
  });

  it('skips a verse that has a recording row but activeTakeId is null (no active take)', () => {
    const recordings = [
      makeRecording(1, [{ id: 11, durationSeconds: 5 }], null, 'clean'),
      makeRecording(2, [{ id: 21, durationSeconds: 7 }], 21, 'clean'),
    ];

    const { result } = renderHook(() =>
      useStitchedAudio({
        verseNumbers: [1, 2],
        recordings,
      })
    );

    expect(result.current.tracks.map(t => t.verseNumber)).toEqual([2]);
    expect(result.current.skippedVerses).toEqual([{ verseNumber: 1, reason: 'no active take' }]);
  });

  it('marks verse as "no recording" when recording has empty takes', () => {
    const recordings = [
      makeRecording(1, [], null, 'clean'),
      makeRecording(2, [{ id: 21, durationSeconds: 7 }], 21, 'clean'),
    ];

    const { result } = renderHook(() =>
      useStitchedAudio({
        verseNumbers: [1, 2],
        recordings,
      })
    );

    expect(result.current.tracks.map(t => t.verseNumber)).toEqual([2]);
    expect(result.current.skippedVerses).toEqual([{ verseNumber: 1, reason: 'no recording' }]);
  });

  it('marks verse as "no active take" when active take lacks a downloadUrl', () => {
    const rec1 = makeRecording(1, [{ id: 11, durationSeconds: 5 }], 11, 'clean');
    rec1.takes[0].downloadUrl = null as unknown as string;
    const recordings = [rec1, makeRecording(2, [{ id: 21, durationSeconds: 7 }], 21, 'clean')];

    const { result } = renderHook(() =>
      useStitchedAudio({
        verseNumbers: [1, 2],
        recordings,
      })
    );

    expect(result.current.tracks.map(t => t.verseNumber)).toEqual([2]);
    expect(result.current.skippedVerses).toEqual([{ verseNumber: 1, reason: 'no active take' }]);
  });

  it('detects active pericope-level take when pericope recording is present and clean', () => {
    const pericopeRecording: VerseAudioRecording = {
      ...makeRecording(6, [{ id: 600, durationSeconds: 25 }], 600),
      isPericope: true,
      pericopeRange: [6, 9],
    };

    const recordings = [
      pericopeRecording,
      makeRecording(6, [{ id: 61, durationSeconds: 5 }], 61),
      makeRecording(7, [{ id: 71, durationSeconds: 6 }], 71),
    ];

    const { result } = renderHook(() =>
      useStitchedAudio({
        verseNumbers: [6, 7, 8, 9],
        recordings,
      })
    );

    expect(result.current.hasOnlyPerVerseRecordings).toBe(false);
    expect(result.current.hasActivePericopeTake).toBe(true);
    expect(result.current.activePericopeTake?.id).toBe(600);
  });

  it('skips pericope recordings that have no range instead of falling back to single verse', () => {
    // Pericope recording marked isPericope: true but with missing range
    const rangelessPericope: VerseAudioRecording = {
      ...makeRecording(6, [{ id: 600, durationSeconds: 25 }], 600),
      isPericope: true,
    };

    const recordings = [
      rangelessPericope,
      makeRecording(6, [{ id: 61, durationSeconds: 5 }], 61),
      makeRecording(7, [{ id: 71, durationSeconds: 6 }], 71),
    ];

    const { result } = renderHook(() =>
      useStitchedAudio({
        verseNumbers: [6, 7],
        recordings,
      })
    );

    // Should NOT treat rangelessPericope as covering verse 6
    expect(result.current.hasOnlyPerVerseRecordings).toBe(true);
    expect(result.current.hasActivePericopeTake).toBe(false);
  });

  it('resolves cross-chapter pericope to its takes rather than stitched audio for current chapter portion', () => {
    const crossChapterRecording = {
      id: 99,
      verseNumber: 20,
      granularity: 'pericope',
      startChapter: 6,
      startVerse: 20,
      endChapter: 7,
      endVerse: 2,
      conflictStatus: 'clean',
      activeTakeId: 991,
      takes: [
        {
          id: 991,
          downloadUrl: 'https://example.com/p991.webm',
          durationSeconds: 30,
          granularity: 'pericope',
          startChapter: 6,
          startVerse: 20,
          endChapter: 7,
          endVerse: 2,
        },
      ],
    } as unknown as VerseAudioRecording;

    const { result } = renderHook(() =>
      useStitchedAudio({
        verseNumbers: [20, 21, 22],
        recordings: [crossChapterRecording],
        currentChapter: 6,
      })
    );

    expect(result.current.hasOnlyPerVerseRecordings).toBe(false);
    expect(result.current.hasActivePericopeTake).toBe(true);
    expect(result.current.activePericopeTake?.id).toBe(991);
  });
});

describe('resolvePericopeBounds', () => {
  it('returns bounds when pericopeRange is present on recording', () => {
    const r = {
      pericopeRange: [3, 7] as [number, number],
      takes: [],
    } as unknown as VerseAudioRecording;
    expect(resolvePericopeBounds(r)).toEqual({
      startChapter: undefined,
      startVerse: 3,
      endChapter: undefined,
      endVerse: 7,
    });
  });

  it('returns bounds when pericopeRange is on take', () => {
    const r = {
      takes: [{ pericopeRange: [4, 8] }],
    } as unknown as VerseAudioRecording;
    expect(resolvePericopeBounds(r)).toEqual({
      startChapter: undefined,
      startVerse: 4,
      endChapter: undefined,
      endVerse: 8,
    });
  });

  it('returns bounds when startVerse and endVerse are present with granularity pericope', () => {
    const r = {
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 1,
      endChapter: 1,
      endVerse: 5,
      takes: [],
    } as unknown as VerseAudioRecording;
    expect(resolvePericopeBounds(r)).toEqual({
      startChapter: 1,
      startVerse: 1,
      endChapter: 1,
      endVerse: 5,
    });
  });

  it('returns bounds when startVerse and endVerse are on take with granularity pericope', () => {
    const r = {
      granularity: 'pericope',
      takes: [
        {
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 2,
          endChapter: 1,
          endVerse: 6,
        },
      ],
    } as unknown as VerseAudioRecording;
    expect(resolvePericopeBounds(r)).toEqual({
      startChapter: 1,
      startVerse: 2,
      endChapter: 1,
      endVerse: 6,
    });
  });

  it('prefers bounded take marked as pericope-level over take without granularity marker', () => {
    const r = {
      granularity: 'pericope',
      takes: [
        {
          startChapter: 1,
          startVerse: 1,
          endChapter: 1,
          endVerse: 10,
        },
        {
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 2,
          endChapter: 1,
          endVerse: 5,
        },
      ],
    } as unknown as VerseAudioRecording;
    expect(resolvePericopeBounds(r)).toEqual({
      startChapter: 1,
      startVerse: 2,
      endChapter: 1,
      endVerse: 5,
    });
  });

  it('retains chapter-aware bounds on the returned bounds', () => {
    const r = {
      granularity: 'pericope',
      startChapter: 6,
      startVerse: 20,
      endChapter: 7,
      endVerse: 2,
      takes: [],
    } as unknown as VerseAudioRecording;
    const bounds = resolvePericopeBounds(r);
    expect(bounds).toEqual({
      startChapter: 6,
      startVerse: 20,
      endChapter: 7,
      endVerse: 2,
    });
  });

  it('returns null for a verse recording even when startVerse and endVerse are present', () => {
    const r = {
      granularity: 'verse',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 3,
      takes: [],
    } as unknown as VerseAudioRecording;
    expect(resolvePericopeBounds(r)).toBeNull();
  });
});

describe('isPericopeRecording', () => {
  it('returns true when granularity is pericope', () => {
    const r = {
      granularity: 'pericope',
      startVerse: 1,
      endVerse: 4,
      takes: [],
    } as unknown as VerseAudioRecording;
    expect(isPericopeRecording(r)).toBe(true);
  });

  it('returns false when granularity is verse', () => {
    const r = {
      granularity: 'verse',
      startVerse: 1,
      endVerse: 1,
      takes: [],
    } as unknown as VerseAudioRecording;
    expect(isPericopeRecording(r)).toBe(false);
  });

  it('returns true when a take has granularity pericope', () => {
    const r = {
      takes: [{ granularity: 'pericope' }],
    } as unknown as VerseAudioRecording;
    expect(isPericopeRecording(r)).toBe(true);
  });
});

describe('pericopeCoversVerse', () => {
  it('handles single-chapter bounds', () => {
    const bounds = {
      startChapter: 1,
      startVerse: 5,
      endChapter: 1,
      endVerse: 10,
    };
    expect(pericopeCoversVerse(bounds, 4, 1)).toBe(false);
    expect(pericopeCoversVerse(bounds, 5, 1)).toBe(true);
    expect(pericopeCoversVerse(bounds, 8, 1)).toBe(true);
    expect(pericopeCoversVerse(bounds, 10, 1)).toBe(true);
    expect(pericopeCoversVerse(bounds, 11, 1)).toBe(false);
    expect(pericopeCoversVerse(bounds, 5, 2)).toBe(false);
  });

  it('handles cross-chapter bounds spanning ch 6 v 30 to ch 7 v 2', () => {
    const bounds = {
      startChapter: 6,
      startVerse: 30,
      endChapter: 7,
      endVerse: 2,
    };
    // Chapter 5: outside
    expect(pericopeCoversVerse(bounds, 30, 5)).toBe(false);

    // Chapter 6: startChapter, covers verse >= 30
    expect(pericopeCoversVerse(bounds, 29, 6)).toBe(false);
    expect(pericopeCoversVerse(bounds, 30, 6)).toBe(true);
    expect(pericopeCoversVerse(bounds, 35, 6)).toBe(true);

    // Chapter 7: endChapter, covers verse <= 2
    expect(pericopeCoversVerse(bounds, 1, 7)).toBe(true);
    expect(pericopeCoversVerse(bounds, 2, 7)).toBe(true);
    expect(pericopeCoversVerse(bounds, 3, 7)).toBe(false);

    // Chapter 8: outside
    expect(pericopeCoversVerse(bounds, 1, 8)).toBe(false);
  });

  it('handles multi-chapter pericopes spanning 3+ chapters', () => {
    const bounds = {
      startChapter: 1,
      startVerse: 10,
      endChapter: 3,
      endVerse: 5,
    };
    // Middle chapter 2: fully covered
    expect(pericopeCoversVerse(bounds, 1, 2)).toBe(true);
    expect(pericopeCoversVerse(bounds, 99, 2)).toBe(true);
  });

  it('handles bounds without chapter numbers (legacy fallback)', () => {
    const bounds = {
      startVerse: 2,
      endVerse: 5,
    };
    expect(pericopeCoversVerse(bounds, 1, 1)).toBe(false);
    expect(pericopeCoversVerse(bounds, 2, 1)).toBe(true);
    expect(pericopeCoversVerse(bounds, 5, 1)).toBe(true);
    expect(pericopeCoversVerse(bounds, 6, 1)).toBe(false);
  });
});
