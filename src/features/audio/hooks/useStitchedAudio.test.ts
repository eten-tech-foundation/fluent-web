import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type VerseAudioRecording } from '@/lib/types';

import { useStitchedAudio } from './useStitchedAudio';

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
    expect(result.current.skippedVerses).toEqual([{ verseNumber: 1, reason: 'no recording' }]);
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
});
