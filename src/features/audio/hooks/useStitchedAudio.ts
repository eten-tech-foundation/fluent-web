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

export interface UseStitchedAudioOptions {
  /** Ordered list of verse numbers in the pericope */
  verseNumbers: number[];
  /** Chapter audio recordings */
  recordings: VerseAudioRecording[];
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
    r.isPericope === true ||
    r.granularity === 'pericope' ||
    Boolean(r.pericopeRange && r.pericopeRange[0] !== r.pericopeRange[1]) ||
    r.takes.some(t => t.isPericope)
  );
}

export function pericopeSpan(r: VerseAudioRecording): [number, number] | null {
  const range = r.pericopeRange ?? r.takes[0]?.pericopeRange;
  if (range) {
    const [start, end] = range;
    if (typeof start === 'number' && typeof end === 'number') {
      return [start, end];
    }
  }
  return null;
}

export function useStitchedAudio({
  verseNumbers,
  recordings,
}: UseStitchedAudioOptions): StitchedAudioResult {
  return useMemo(() => {
    const sortedVerseNums = [...verseNumbers].sort((a, b) => a - b);
    const startVerse = sortedVerseNums[0];
    const endVerse = sortedVerseNums[sortedVerseNums.length - 1];

    // Check for pericope-level recordings covering this pericope
    const pericopeRecordings = recordings.filter(r => {
      if (!isPericopeRecording(r)) return false;
      const span = pericopeSpan(r);
      if (!span) return false;
      return span[0] === startVerse && span[1] === endVerse;
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
  }, [verseNumbers, recordings]);
}
