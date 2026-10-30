import { useMemo } from 'react';

import { type VerseAudioRecording, type VerseAudioTake } from '@/lib/types';

export interface StitchedTrack {
  verseNumber: number;
  takeId: number;
  downloadUrl: string;
  durationSeconds: number;
}

export type SkippedReason = 'conflict' | 'no recording' | 'no active take';

export interface SkippedVerse {
  verseNumber: number;
  reason: SkippedReason;
}

export interface PericopeBounds {
  startChapter?: number | null;
  startVerse: number;
  endChapter?: number | null;
  endVerse: number;
}

export type PericopeSpan = PericopeBounds;

export interface UseStitchedAudioOptions {
  /** Ordered list of verse numbers in the pericope */
  verseNumbers: number[];
  /** Chapter audio recordings */
  recordings: VerseAudioRecording[];
  /** Current chapter number, if known (used for cross-chapter pericope matching) */
  currentChapter?: number;
}

export interface StitchedAudioResult {
  /** Whether the pericope has an active pericope-level take (takes precedence over stitching) */
  hasActivePericopeTake: boolean;
  /** Active pericope take if present */
  activePericopeTake?: VerseAudioTake;
  /** All pericope-level takes covering this pericope */
  pericopeTakes: VerseAudioTake[];
  /** Whether the pericope has only per-verse recordings */
  hasOnlyPerVerseRecordings: boolean;
  /** Ordered active verse tracks to stitch together */
  tracks: StitchedTrack[];
  /** Verses skipped from stitching, with reason */
  skippedVerses: SkippedVerse[];
  /** Total duration in seconds of all stitched tracks */
  totalDuration: number;
}

/** Check if a recording is at pericope granularity */
export function isPericopeRecording(r: VerseAudioRecording): boolean {
  return (
    r.granularity === 'pericope' ||
    r.isPericope === true ||
    Boolean(r.pericopeRange && r.pericopeRange[0] !== r.pericopeRange[1]) ||
    r.takes.some(
      t =>
        t.granularity === 'pericope' ||
        t.isPericope === true ||
        Boolean(t.pericopeRange && t.pericopeRange[0] !== t.pericopeRange[1])
    )
  );
}

type BoundedTake = VerseAudioTake & { startVerse: number; endVerse: number };

function isBoundedTake(t: VerseAudioTake): t is BoundedTake {
  return typeof t.startVerse === 'number' && typeof t.endVerse === 'number';
}

function takeToBounds(t: BoundedTake, r: VerseAudioRecording): PericopeBounds {
  return {
    startChapter: t.startChapter ?? r.startChapter,
    startVerse: t.startVerse,
    endChapter: t.endChapter ?? r.endChapter,
    endVerse: t.endVerse,
  };
}

/** Resolve chapter and verse boundaries for a pericope recording or its takes */
export function resolvePericopeBounds(r: VerseAudioRecording): PericopeBounds | null {
  if (!isPericopeRecording(r)) return null;

  // 1. Choose a bounded take marked as pericope-level
  const pericopeTake = r.takes.find(
    (t): t is BoundedTake =>
      isBoundedTake(t) && (t.granularity === 'pericope' || t.isPericope === true)
  );
  if (pericopeTake) {
    return takeToBounds(pericopeTake, r);
  }

  // 2. Recording-level fallback (when no take-level pericope marker exists)
  if (typeof r.startVerse === 'number' && typeof r.endVerse === 'number') {
    return {
      startChapter: r.startChapter,
      startVerse: r.startVerse,
      endChapter: r.endChapter,
      endVerse: r.endVerse,
    };
  }

  // 3. Fallback to any bounded take when no take-level granularity marker exists
  const hasTakeGranularityMarker = r.takes.some(t => t.granularity != null || t.isPericope != null);
  if (!hasTakeGranularityMarker) {
    const takeWithSpan = r.takes.find(isBoundedTake);
    if (takeWithSpan) {
      return takeToBounds(takeWithSpan, r);
    }
  }

  // 4. Legacy pericopeRange
  const range = r.pericopeRange ?? r.takes[0]?.pericopeRange;
  if (range) {
    const [start, end] = range;
    if (typeof start === 'number' && typeof end === 'number') {
      return {
        startChapter: r.startChapter,
        startVerse: start,
        endChapter: r.endChapter,
        endVerse: end,
      };
    }
  }

  return null;
}

/**
 * Check whether pericope bounds cover a specific verse in a given chapter.
 */
export function pericopeCoversVerse(
  bounds: PericopeBounds,
  verse: number,
  chapter: number
): boolean {
  const { startChapter, endChapter, startVerse, endVerse } = bounds;
  if (startChapter == null || endChapter == null) {
    return verse >= startVerse && verse <= endVerse;
  }
  if (chapter < startChapter || chapter > endChapter) return false;
  if (startChapter === endChapter) {
    return verse >= startVerse && verse <= endVerse;
  }
  if (chapter === startChapter) return verse >= startVerse;
  if (chapter === endChapter) return verse <= endVerse;
  return true; // middle chapter of the span: fully covered
}

/** Alias of resolvePericopeBounds returning PericopeBounds directly */
export const pericopeSpan = resolvePericopeBounds;

export function useStitchedAudio({
  verseNumbers,
  recordings,
  currentChapter,
}: UseStitchedAudioOptions): StitchedAudioResult {
  return useMemo(() => {
    const sortedVerseNums = [...verseNumbers].sort((a, b) => a - b);
    const startVerse = sortedVerseNums[0];
    const endVerse = sortedVerseNums[sortedVerseNums.length - 1];

    // Check for pericope-level recordings covering this pericope
    const pericopeRecordings = recordings.filter(r => {
      if (!isPericopeRecording(r)) return false;
      const bounds = resolvePericopeBounds(r);
      if (!bounds) return false;

      // When matching takes, compare only the pericope’s portion within the
      // current chapter so recordings spanning chapter boundaries resolve to their takes
      // rather than stitched audio.
      if (
        bounds.startChapter != null &&
        bounds.endChapter != null &&
        bounds.startChapter !== bounds.endChapter
      ) {
        if (currentChapter == null) return false;
        if (currentChapter === bounds.startChapter) {
          return bounds.startVerse === startVerse;
        }
        if (currentChapter === bounds.endChapter) {
          return bounds.endVerse === endVerse;
        }
        if (currentChapter > bounds.startChapter && currentChapter < bounds.endChapter) {
          return true;
        }
        return false;
      }

      return bounds.startVerse === startVerse && bounds.endVerse === endVerse;
    });

    const pericopeTakes = pericopeRecordings.flatMap(r => r.takes);
    const activePericopeRecording = pericopeRecordings.find(
      r => r.conflictStatus !== 'conflict' && r.activeTakeId !== null
    );
    const activePericopeTake = activePericopeRecording?.takes.find(
      t => t.id === activePericopeRecording.activeTakeId
    );

    const hasActivePericopeTake = Boolean(activePericopeTake);
    // When any pericope-level takes exist (including while in conflict or pending resolution),
    // the takes list is shown so the PM can review and resolve the pericope-level takes.
    // Verse stitching is only used when the pericope has exclusively per-verse recordings.
    const hasOnlyPerVerseRecordings = pericopeTakes.length === 0;

    // Build verse-by-verse recording map for quick lookup
    const verseRecordingMap = new Map<number, VerseAudioRecording>();
    for (const r of recordings) {
      if (!isPericopeRecording(r)) {
        verseRecordingMap.set(r.verseNumber, r);
      }
    }

    const tracks: StitchedTrack[] = [];
    const skippedVerses: SkippedVerse[] = [];

    for (const v of sortedVerseNums) {
      const rec = verseRecordingMap.get(v);
      if (!rec || rec.takes.length === 0) {
        skippedVerses.push({ verseNumber: v, reason: 'no recording' });
        continue;
      }

      if (rec.conflictStatus === 'conflict') {
        skippedVerses.push({ verseNumber: v, reason: 'conflict' });
        continue;
      }

      const activeTake = rec.takes.find(t => t.id === rec.activeTakeId);
      if (!activeTake?.downloadUrl) {
        skippedVerses.push({ verseNumber: v, reason: 'no active take' });
        continue;
      }

      tracks.push({
        verseNumber: v,
        takeId: activeTake.id,
        downloadUrl: activeTake.downloadUrl,
        durationSeconds: activeTake.durationSeconds ?? 0,
      });
    }

    const totalDuration = tracks.reduce((sum, t) => sum + t.durationSeconds, 0);

    return {
      hasActivePericopeTake,
      activePericopeTake,
      pericopeTakes,
      hasOnlyPerVerseRecordings,
      tracks,
      skippedVerses,
      totalDuration,
    };
  }, [verseNumbers, recordings, currentChapter]);
}
