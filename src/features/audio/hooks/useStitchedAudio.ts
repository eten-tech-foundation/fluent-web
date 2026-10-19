import { useMemo } from 'react';

import { type VerseAudioRecording, type VerseAudioTake } from '@/lib/types';

export interface StitchedTrack {
  verseNumber: number;
  takeId: number;
  downloadUrl: string;
  durationSeconds: number;
}

export type SkippedReason = 'conflict' | 'no recording';

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
      if (r.pericopeRange) {
        return r.pericopeRange[0] === startVerse && r.pericopeRange[1] === endVerse;
      }
      return r.verseNumber === startVerse;
    });

    const pericopeTakes = pericopeRecordings.flatMap(r => r.takes);
    const activePericopeRecording = pericopeRecordings.find(
      r => r.conflictStatus !== 'conflict' && r.activeTakeId !== null
    );
    const activePericopeTake = activePericopeRecording?.takes.find(
      t => t.id === activePericopeRecording.activeTakeId
    );

    const hasActivePericopeTake = Boolean(activePericopeTake);
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
      if (!rec) {
        skippedVerses.push({ verseNumber: v, reason: 'no recording' });
        continue;
      }

      if (rec.conflictStatus === 'conflict') {
        skippedVerses.push({ verseNumber: v, reason: 'conflict' });
        continue;
      }

      const activeTake = rec.takes.find(t => t.id === rec.activeTakeId);
      if (!activeTake?.downloadUrl) {
        skippedVerses.push({ verseNumber: v, reason: 'no recording' });
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
