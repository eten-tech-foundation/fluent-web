import { createTtsSegment } from '../lib/createTtsSegment';

import { licenceBar } from './licenceFence';
import { recordedSourceForVerse } from './selectTrack';

import type { ChapterAudioCache } from './chapterCache';
import type { ChapterSourceAudio, ChapterSourceAudioRequest } from './sourceAudioClient';
import type { TtsRowDraft } from '../lib/buildTtsQueueItems';
import type { CreateTtsSegmentOptions } from '../lib/createTtsSegment';
import type { Playable, RecoveryStrategy, SourceThunk } from '../seam/types';

/** Source-side drafting rows only, never translator target rows. Labels remain opaque to L3. */
export interface SourceAudioRow extends TtsRowDraft {
  verseNumber: number;
}

/** Construction inputs for task E's implementing class; no placeholder recovery ships in task D. */
export interface RecordedRecoveryOptions {
  chapter: ChapterSourceAudioRequest;
  cache: ChapterAudioCache;
  verseNumber: number;
  /** Null when synthesis is barred; the licence fence supplies that decision. */
  ttsSource: SourceThunk | null;
}

export interface SourceResolverContext
  extends ChapterSourceAudioRequest, Omit<CreateTtsSegmentOptions, 'playableKey'> {
  pageKey: string;
  cache: ChapterAudioCache;
  recordedRecovery: new (options: RecordedRecoveryOptions) => RecoveryStrategy;
  /** Omit for individual verse playables; supply for one pericope containing these rows in order. */
  pericopeId?: string;
  // The licence fence. Carry the API spelling, not the DB column name.
  /**
   * The assignment's status is authoritative when supplied. The chapter
   * response is a fallback for callers without assignment metadata, so a
   * cleared Bible keeps its voice through a provider outage.
   */
  ttsLicenseStatus?: ChapterSourceAudio['ttsLicenseStatus'];
  licenseNotice?: ChapterSourceAudio['licenseNotice'];
}

/**
 * Bible identity + verse labels, never text presence, decide recorded eligibility (audio-only Bibles).
 * Source rows only: target translation text must never be substituted for missing source text.
 * Building descriptors does no I/O. Selection and markAi occur inside the run's lazy source thunk.
 */
export const resolvePlayables = (
  rows: readonly SourceAudioRow[],
  ctx: SourceResolverContext
): Playable[] => {
  const chapter: ChapterSourceAudioRequest = {
    projectId: ctx.projectId,
    bibleId: ctx.bibleId,
    bookCode: ctx.bookCode,
    chapter: ctx.chapter,
    languageCode: ctx.languageCode,
  };
  const identity = [ctx.pageKey, ctx.projectId, ctx.bibleId, ctx.bookCode, ctx.chapter];
  const groups = ctx.pericopeId === undefined ? rows.map(row => [row]) : [rows];
  return groups
    .filter(group => group.length > 0)
    .map(group => {
      const key = JSON.stringify([
        ...identity,
        ctx.pericopeId === undefined ? 'verse' : 'pericope',
        ctx.pericopeId ?? group[0].verseRef,
        group.map(row => [row.verseNumber, row.verseRef]),
      ]);
      return {
        key,
        segments: group.map(row => {
          const tts = createTtsSegment(
            {
              verseRef: row.verseRef,
              text: (row.text ?? '').trim(),
              langCode: (row.langCode === '' ? undefined : row.langCode) ?? ctx.languageCode,
            },
            { ...ctx, playableKey: key }
          );
          const ttsSource: SourceThunk = resolution => {
            resolution.signal.throwIfAborted();
            if (!tts.text) throw new Error(`No source text for verse ${row.verseRef}`);
            return tts.source(resolution);
          };
          return {
            ...tts,
            source: async resolution => {
              const { signal, run, requests } = resolution;
              signal.throwIfAborted();
              const canUseRecording = () => !run.forceTts;
              let response: ChapterSourceAudio | undefined;
              if (canUseRecording()) {
                try {
                  response = await ctx.cache.get(chapter, signal);
                } catch {
                  // An unavailable recording path earns TTS where the licence
                  // allows it; cancellation never earns synthesis.
                  signal.throwIfAborted();
                }
                signal.throwIfAborted();
              }
              // The fence, in one branch: synthesis exists only for a Bible
              // whose status says `allowed`. The status travels with the
              // assignment, so this holds when no recording answer arrives at
              // all — and a status nobody supplied is not a clearance.
              const barred = licenceBar(
                ctx.ttsLicenseStatus ??
                  response?.ttsLicenseStatus ??
                  ctx.cache.peek(chapter)?.ttsLicenseStatus
              );
              // A downgrade may have happened while this chapter request was in flight.
              const source =
                canUseRecording() && response
                  ? recordedSourceForVerse(response, row.verseNumber, ctx.cache.supportsOpus)
                  : undefined;
              if (source) {
                requests.attach(
                  new ctx.recordedRecovery({
                    chapter,
                    cache: ctx.cache,
                    verseNumber: row.verseNumber,
                    // Barred audio hands off to nothing: an exhausted recording
                    // ends the run rather than reaching for a voice.
                    ttsSource: barred === null ? ttsSource : null,
                  })
                );
                return source;
              }
              if (barred !== null) {
                // Diagnostic, never shown: the host names the reason a listener reads.
                throw new Error(`Synthesis barred by the licence fence (${barred})`);
              }
              return ttsSource(resolution);
            },
          };
        }),
      };
    });
};
