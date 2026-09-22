/**
 * `useSourceTtsPlayback` — everything a source-scripture surface needs to host
 * recorded audio with TTS fallback, supplying only source identity, data and refs.
 *
 * It owns three host responsibilities the queue deliberately refuses:
 *   1. Document-order queue construction for "play from here" (§5.1).
 *   2. Conditional auto-scroll of the active row (§5.3 step 2) — no focus theft.
 *   3. Surfacing a playback failure as a toast (§5.2).
 *
 * The feature flag is not resolved here — the surface owns it (§6.3, T12) and
 * hands the answer down as `enabled`. The surface cannot express that gate by
 * skipping the call, because React forbids a conditional hook, so honouring
 * `enabled` is THIS hook's job.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { isPlayableRow } from '../lib/buildTtsQueueItems';
import { pressPrimary, pressRestart, unavailableReason } from '../lib/controlActions';
import {
  type ScrollableRow,
  scrollRowIntoViewIfNeeded,
  type ScrollViewport,
} from '../lib/scrollRowIntoView';
import { useOffline } from '../lib/useOffline';
import { writeRecord } from '../registry/pauseRecord';
import { usePlaybackRegistry } from '../registry/usePlaybackRegistry';
import { ChapterAudioCache, chapterAudioKey } from '../resolver/chapterCache';
import {
  impossibleLicenceReason,
  knownChapterTts,
  licenceBarReason,
  licenceVerdictForVerse,
  noteLicenceBar,
  recordedFailedBarredReason,
} from '../resolver/licenceFence';
import { resolvePlayables, type SourceAudioRow } from '../resolver/resolvePlayables';
import { recordingProvenance, type RecordingProvenance } from '../resolver/selectTrack';
import {
  type ChapterSourceAudio,
  type ChapterSourceAudioRequest,
} from '../resolver/sourceAudioClient';
import { type Playable, type Segment } from '../seam/types';
import { RecordedRecoveryStrategy } from '../strategies/recordedRecoveryStrategy';
import { type TtsEngine, type TtsServedFormat } from '../tts.types';

import { usePlaybackTiming } from './usePlaybackTiming';
import { useRecordedNotice } from './useRecordedNotice';
import {
  type PauseSnapshot,
  type TtsPlaybackStatus,
  useTtsPlaybackQueue,
} from './useTtsPlaybackQueue';

import type { RecordedNotice } from '../lib/ackStore';
import type { ProviderFactsAccess } from '../resolver/providerFacts';

export interface UseSourceTtsPlaybackOptions {
  engine: TtsEngine;
  facts?: ProviderFactsAccess;
  /** Rows in the order they are read on screen; unplayable ones may be included. */
  rows: readonly SourceAudioRow[];
  /** Null for reference-panel text: its provider identity is not a Fluent Bible id. */
  sourceChapter: ChapterSourceAudioRequest | null;
  /**
   * The source Bible's audio licence, from the chapter assignment the surface
   * already loaded. The fence prefers this to the copy on the chapter-audio
   * response, because this one survives a provider outage.
   */
  sourceLicence?: {
    status?: 'allowed' | 'forbidden' | 'unknown';
    notice?: string | null;
  };
  /** Domain-qualified reference selection identity; never used to select an audio provider. */
  referenceBibleId: string | null;
  /** Display label for the qualified text identity currently being heard. */
  textBibleName?: string;
  /** Resolve a row's DOM node for scroll geometry. */
  getRowElement: (verseRef: string) => ScrollableRow | null | undefined;
  /** The scrolling container; null disables auto-scroll rather than guessing. */
  getViewport: () => ScrollViewport | null | undefined;
  /**
   * Stable page identity: playback state is dropped when this changes.
   * The drafting route swaps chapter data WITHOUT unmounting (no router
   * `remountDeps`), so unmount cleanup alone cannot silence the old chapter.
   * Otherwise its captured items keep playing while `activeVerseRef`
   * highlights the same verse number on the new page.
   */
  pageKey?: string;
  /**
   * The surface's feature-flag answer, already merged with any local override
   * (O3) — pass the same boolean that decides whether controls render.
   *
   * False stops anything already playing. This matters to the listener,
   * because the controls and the Alt+S shortcut disappear WITH the flag, so a
   * queue left running would have nothing left to stop it. Defaults to true so
   * a surface with no flag of its own needs no argument.
   */
  enabled?: boolean;
}

export interface PericopePlaybackView {
  key: string | null;
  isLive: boolean;
  staticAi: boolean;
  dynamicAi: boolean;
  /** Eager source facts; the rendered player latches them on its own group key. */
  impossibleReason?: string | null;
  segments: Array<{
    verseRef: string;
    text: string;
    durationSeconds: number | null;
    epoch: number | null;
  }>;
  currentIndex: number;
  /** Segment-local seconds: components never inspect a media window. */
  currentTime: number;
  pendingFraction?: number;
  recordedNotice?: RecordedNotice | null;
}

export interface SourceTtsPlaybackApi {
  /** Actual sounding recording metadata; no entry for TTS, loading or stopped playback. */
  recording?: RecordingProvenance & { textBibleKey: string | null; notice: string | null };
  recordedNoticeDialog: RecordedNotice | null;
  closeRecordedNotice: () => void;
  showRecordedNotice: (notice: RecordedNotice) => void;
  status: TtsPlaybackStatus;
  /** Live-run badge channel; idle controls read the registry instead. */
  aiMarkedKeys: ReadonlySet<string>;
  activeVerseRef: string | null;
  /** Queue-wide: Stop is visible whenever anything is loading or playing (§5.1). */
  isBusy: boolean;
  /** True only for rows that have playable text (§5.1). */
  isRowPlayable: (verseRef: string) => boolean;
  /** This row is fetching its clip (§5.2). */
  isRowLoading: (verseRef: string) => boolean;
  /**
   * Which container this row's clip was served as (§9.2) — a verification
   * signal, not playback. Undefined until the row has a clip.
   */
  servingFor: (verseRef: string) => TtsServedFormat | undefined;
  playVerse: (verseRef: string) => void;
  playFromVerse: (verseRef: string) => void;
  /**
   * G3a: play a bounded GROUP of rows and stop at its end — pericope mode's
   * unit of playback is the pericope, not the verse. Refs may be given in any
   * order and may include unplayable rows; document order and playability come
   * from the page's own item list.
   */
  playGroup: (verseRefs: readonly string[]) => void;
  /** Primary plus caret seek, using the same bounded pericope and scrub machinery. */
  playGroupAtVerse: (verseRefs: readonly string[], verseRef: string) => void;
  /** Continuous reading through the displayed pericope playables, not verse-sized substitutes. */
  playFromGroups: (groups: ReadonlyArray<readonly string[]>, verseRef: string) => void;
  /**
   * G3a: continuous reading from this GROUP to the end of the page — the group
   * analogue of `playFromVerse`. Starts at the group's first PLAYABLE row, not
   * simply its first row, so a group opening on a reference-panel hole still
   * starts where the audio actually does.
   */
  playFromGroup: (verseRefs: readonly string[]) => void;
  /** G3a: true while the playing row is one of these — the group-level highlight. */
  isGroupSpeaking: (verseRefs: readonly string[]) => boolean;
  /** Pause drops all media and keeps only a page-lifetime position. */
  pause: () => void;
  /** Explicit reset retained for surfaces that need Stop rather than Pause. */
  stop: () => void;
  restartVerse: (verseRef: string) => void;
  restartGroup: (verseRefs: readonly string[]) => void;
  verseKey: (verseRef: string) => string | null;
  groupKey: (verseRefs: readonly string[]) => string | null;
  groupView: (verseRefs: readonly string[]) => PericopePlaybackView;
  seekGroup: (verseRefs: readonly string[], targetVerseRef: string, fraction: number) => void;
}

interface HostRun {
  items: Segment[];
  keys: Set<string>;
  liveKey: string;
  selectionKey: string;
}

export const useSourceTtsPlayback = (
  options: UseSourceTtsPlaybackOptions
): SourceTtsPlaybackApi => {
  const {
    engine,
    rows,
    sourceChapter,
    sourceLicence,
    facts,
    referenceBibleId,
    textBibleName = '',
    getRowElement,
    getViewport,
    pageKey,
    enabled = true,
  } = options;
  const [, refreshFacts] = useState(0);
  const textKey = sourceChapter?.textBibleKey ?? null;
  const observedStatus = facts ? facts.observedStatus(textKey) : sourceLicence?.status;
  const licenceStatus = facts ? facts.status(textKey) : sourceLicence?.status;
  const [soundingRecording, setSoundingRecording] = useState<
    (RecordingProvenance & { playableKey: string; selectionKey: string }) | null
  >(null);
  const selectionSlot = JSON.stringify([
    sourceChapter?.role ?? 'projectSource',
    sourceChapter?.role === 'referenceBible' ? sourceChapter.textBibleKey : sourceChapter?.bibleId,
  ]);
  const selectionKey = sourceChapter
    ? chapterAudioKey(sourceChapter)
    : JSON.stringify(['reference', referenceBibleId]);
  const { t } = useTranslation();
  const registry = usePlaybackRegistry();
  const offline = useOffline();
  const restartLiveRef = useRef<() => void>(() => {});
  const runRef = useRef<HostRun | null>(null);
  const preferredResumeKeysRef = useRef(new Map<string, string>());
  const releaseRef = useRef<(() => void) | null>(null);
  const timing = usePlaybackTiming(pageKey);

  // Callbacks handed to the queue must not go stale between clips, and must
  // not re-create the queue session, so the volatile inputs live in refs.
  const latest = useRef({
    getRowElement,
    getViewport,
    engine,
    pageKey,
    sourceChapter,
    licenceStatus,
    referenceBibleId,
    facts,
    selectionKey,
    rows,
  });
  latest.current = {
    getRowElement,
    getViewport,
    engine,
    pageKey,
    sourceChapter,
    licenceStatus,
    referenceBibleId,
    facts,
    selectionKey,
    rows,
  };
  const [cache] = useState(() => new ChapterAudioCache());
  const [itemServing, setItemServing] = useState<Record<string, TtsServedFormat>>({});
  const playablesFor = useCallback(
    (sourceRows: readonly SourceAudioRow[], pericopeId?: string): Playable[] => {
      const {
        engine: currentEngine,
        pageKey: currentPage,
        sourceChapter: chapter,
        licenceStatus: currentLicence,
        facts: currentFacts,
        selectionKey: capturedSelection,
      } = latest.current;
      const construction = {
        engine: currentEngine,
        pageKey: currentPage ?? '',
        onServing: (verseRef: string, servedAs: TtsServedFormat) =>
          setItemServing(previous => ({ ...previous, [verseRef]: servedAs })),
      };
      if (chapter) {
        return resolvePlayables(sourceRows, {
          ...construction,
          ...chapter,
          cache,
          recordedRecovery: RecordedRecoveryStrategy,
          pericopeId,
          // The assignment's answer first; a held response only fills in for an
          // API that does not carry the licence on the assignment yet.
          ttsLicenseStatus: currentFacts
            ? currentFacts.status(chapter.textBibleKey ?? null)
            : (currentLicence ?? cache.peek(chapter)?.ttsLicenseStatus),
          facts: currentFacts,
          isCurrent: () =>
            latest.current.selectionKey === capturedSelection &&
            sourceRows.every(row =>
              latest.current.rows.some(
                current =>
                  current.verseRef === row.verseRef && !current.unavailable && !current.loading
              )
            ),
        });
      }
      // A reference must carry its exact descriptor and pass the same fence.
      return [];
    },
    [cache]
  );

  // Text holes remain disabled in this text-drafting host. The resolver itself
  // accepts text-free rows for future audio-only surfaces.
  const items = useMemo(() => rows.filter(isPlayableRow), [rows]);
  const itemsRef = useRef<readonly SourceAudioRow[]>(items);
  itemsRef.current = items;

  // The last chapter answer this page saw. A failed heal empties the cache, so
  // without this the host could not tell "this verse has no recording" from
  // "the recording we were playing just became unreachable" — and those two
  // deserve different words and only one of them is permanent.
  const lastChapterRef = useRef<{ key: string; response: ChapterSourceAudio } | null>(null);
  const [knownChapter, setKnownChapter] = useState<ChapterSourceAudio>();
  const rememberChapter = useCallback(
    (chapter: ChapterSourceAudioRequest | null) => {
      const response = chapter ? cache.peek(chapter) : undefined;
      if (!chapter || !response) return lastChapterRef.current;
      lastChapterRef.current = { key: chapterAudioKey(chapter), response };
      // Cache writes alone are not React updates. Publish discovery explicitly
      // so neighbouring controls update even with stable rows and i18n t.
      setKnownChapter(response);
      return lastChapterRef.current;
    },
    [cache]
  );

  const knownImpossibleReason = useCallback(
    (playable: Playable | undefined): string | null => {
      const baseChapter = latest.current.sourceChapter;
      if (
        !baseChapter ||
        !playable ||
        (latest.current.facts &&
          latest.current.facts.read(baseChapter.textBibleKey ?? null).state !== 'ready')
      )
        return null;
      const targetRows = playable.segments.flatMap(
        segment => itemsRef.current.find(row => row.verseRef === segment.verseRef) ?? []
      );
      const reasons = targetRows.map(row =>
        impossibleLicenceReason(
          t,
          cache.peek({ ...baseChapter, chapter: row.chapterNumber ?? baseChapter.chapter }),
          [row.verseNumber],
          cache.supportsOpus,
          latest.current.licenceStatus
        )
      );
      return reasons.length && reasons.every(Boolean) ? (reasons[0] ?? null) : null;
    },
    [cache, t]
  );
  const disabledReason = useCallback(
    (playable: Playable | undefined) =>
      unavailableReason(t, {
        offline,
        missing: !playable,
        impossibleReason:
          (facts && facts.read(textKey).state !== 'ready'
            ? null
            : playable
              ? registry.getSnapshot(playable.key).impossibleReason
              : null) ?? knownImpossibleReason(playable),
      }),
    [knownImpossibleReason, offline, registry, t, facts, textKey]
  );

  const handleScrollRequest = useCallback(
    (verseRef: string) => {
      const row = itemsRef.current.find(item => item.verseRef === verseRef);
      const base = latest.current.sourceChapter;
      rememberChapter(base ? { ...base, chapter: row?.chapterNumber ?? base.chapter } : null);
      // Keep the last actual recording through the queue's boundary update. The
      // next onSourcePlaying replaces it (or clears it for TTS), while a fresh
      // notice already on screen keeps one stable dialog rather than unmounting
      // and reopening between adjacent recorded verses.
      const run = runRef.current;
      const key = run?.items.find(item => item.verseRef === verseRef)?.playableKey;
      if (run && key) {
        // The old playable has naturally completed, even if this run continues.
        if (run.liveKey !== key) registry.clearRecord(run.liveKey);
        run.liveKey = key;
        registry.setLive(key);
      }
      const { getRowElement: resolveRow, getViewport: resolveViewport } = latest.current;
      // Scrolls only when the row is off-screen, and never calls focus().
      scrollRowIntoViewIfNeeded(resolveRow(verseRef), resolveViewport());
    },
    [registry, rememberChapter]
  );

  const handleError = useCallback(
    (_error: Error, item: Segment) => {
      // §5.2: a failure the listener can see, in their language, naming the
      // verse — not a silent stop and not a raw engine message. The engine's
      // own message is deliberately unused: it is diagnostic, not user-facing.
      //
      // The licence fence's lazy half. A press is the first thing that fetches
      // a chapter, so a barred Bible is often discovered here rather than on
      // render. The verdict is read from the response the press just cached,
      // never from the error's text.
      const errorRow = itemsRef.current.find(candidate => candidate.verseRef === item.verseRef);
      const baseChapter = latest.current.sourceChapter;
      const chapter = baseChapter
        ? { ...baseChapter, chapter: errorRow?.chapterNumber ?? baseChapter.chapter }
        : null;
      const remembered = rememberChapter(chapter);
      const response =
        (chapter ? cache.peek(chapter) : undefined) ??
        (chapter && remembered?.key === chapterAudioKey(chapter) ? remembered.response : undefined);
      const row = itemsRef.current.find(candidate => candidate.verseRef === item.verseRef);
      const verdict =
        chapter && row
          ? licenceVerdictForVerse(
              response,
              row.verseNumber,
              cache.supportsOpus,
              latest.current.licenceStatus
            )
          : undefined;
      if (chapter && verdict?.bar != null) {
        if (verdict.recorded) {
          // A recording failed. Where the voice behind it is barred, say so —
          // the recording may still play next time, so nothing is latched. An
          // unconfirmed licence says nothing about the recording, so that case
          // keeps the ordinary failure message below.
          if (verdict.bar !== 'unconfirmed') {
            toast.error(recordedFailedBarredReason(t));
            return;
          }
        } else {
          const reason = licenceBarReason(t, verdict.bar);
          // Sticky for this playable, like the sparkle: nothing on this page
          // can change a licence, so the control stays impossible once it is
          // known. Only a chapter answer proves there is no recording either,
          // and an unconfirmed licence is not a fact about the Bible — both
          // say why the voice is unavailable without touching the control.
          if (
            response &&
            verdict.bar !== 'unconfirmed' &&
            (!latest.current.facts ||
              latest.current.facts.read(chapter.textBibleKey ?? null).state === 'ready')
          ) {
            registry.setImpossible(item.playableKey, reason);
            noteLicenceBar(
              cache,
              latest.current.pageKey ?? '',
              chapter,
              response,
              latest.current.licenceStatus
            );
          }
          toast.error(reason);
          return;
        }
      }
      toast.error(
        t('ttsPlaybackFailed', 'Could not play audio for verse {{verseRef}}. Please try again.', {
          verseRef: item.verseRef,
        })
      );
    },
    [cache, registry, rememberChapter, t]
  );

  const saveSnapshot = useCallback(
    (snapshot: PauseSnapshot, runSelectionKey: string | undefined) => {
      writeRecord(registry, snapshot);
      if (runSelectionKey) {
        preferredResumeKeysRef.current.set(runSelectionKey, snapshot.playableKey);
      }
    },
    [registry]
  );

  const queue = useTtsPlaybackQueue({
    onSourcePlaying: (source, segment) => {
      const provenance = recordingProvenance(source);
      setSoundingRecording(
        provenance
          ? {
              ...provenance,
              playableKey: segment.playableKey,
              selectionKey: latest.current.selectionKey,
            }
          : null
      );
    },
    onTiming: report => {
      // A clip has real timing only once its source resolved, so this is the
      // last moment the chapter answer is certainly still in the cache.
      rememberChapter(latest.current.sourceChapter);
      timing.onTiming(report);
    },
    onError: (error, segment) => {
      finishRun();
      handleError(error, segment);
    },
    onAutoplayRefused: (snapshot, segment) => {
      saveSnapshot(snapshot, runRef.current?.selectionKey);
      finishRun();
      handleError(new Error('Playback requires a user gesture'), segment);
    },
    onRunEnd: aiMarkedKeys => {
      for (const key of runRef.current?.keys ?? []) {
        registry.setLastDynamicAi(key, aiMarkedKeys.has(key));
      }
    },
    onRunComplete: () => finishRun(true),
    onScrollRequest: handleScrollRequest,
  });

  const queueRef = useRef(queue);
  queueRef.current = queue;

  const finishRun = useCallback(
    (completed = false) => {
      const run = runRef.current;
      if (!run) return;
      for (const key of run.keys) {
        if (completed) registry.clearRecord(key);
      }
      // An idle/unmounting host must not clear a different host's live key.
      if (registry.isLive(run.liveKey)) registry.setLive(null);
      releaseRef.current?.();
      releaseRef.current = null;
      runRef.current = null;
    },
    [registry]
  );

  const pause = useCallback(() => {
    const runSelectionKey = runRef.current?.selectionKey;
    const snapshot = queueRef.current.pause();
    if (snapshot) saveSnapshot(snapshot, runSelectionKey);
    finishRun();
  }, [finishRun, saveSnapshot]);

  const stopWithoutRecord = useCallback(() => {
    queueRef.current.stop();
    setSoundingRecording(null);
    finishRun();
  }, [finishRun]);

  const startRun = useCallback(
    (
      playables: Playable[],
      index = 0,
      bounded = false,
      seek?: { index: number; fraction: number },
      resumeKey?: string
    ) => {
      if (!enabled) return;
      const capturedKey = latest.current.selectionKey;
      const keysForSelection = selectionKeys.current.get(capturedKey) ?? new Set<string>();
      playables.forEach(playable => keysForSelection.add(playable.key));
      selectionKeys.current.set(capturedKey, keysForSelection);
      const segments = playables.flatMap(playable => playable.segments);
      const requestedFirst = segments.at(seek?.index ?? index);
      if (!requestedFirst) return;
      // The claim pauses AND records synchronously, before reading resume data.
      const previousKey = runRef.current?.liveKey;
      const previousIsInTarget = runRef.current?.items.some(
        item =>
          item.playableKey === previousKey &&
          segments.some(target => target.verseRef === item.verseRef)
      );
      releaseRef.current = registry.claim(pause, () => restartLiveRef.current());
      const resumeRecord = resumeKey ? registry.getRecord(resumeKey) : null;
      const record = bounded ? registry.getRecord(requestedFirst.playableKey) : resumeRecord;
      // A seek within this playable keeps its fallback instruction, but seeking
      // a different pericope must not inherit another playable's fallback voice.
      const seekRecord =
        record ?? (previousKey && previousIsInTarget ? registry.getRecord(previousKey) : null);
      const recordIndex = record
        ? segments.findIndex(
            segment =>
              segment.playableKey === (resumeKey ?? requestedFirst.playableKey) &&
              segment.verseRef === record.verseRef
          )
        : -1;
      const resumeIndex = resumeKey
        ? segments.findIndex(segment => segment.playableKey === resumeKey)
        : -1;
      const startIndex =
        seek?.index ?? (recordIndex >= 0 ? recordIndex : resumeIndex >= 0 ? resumeIndex : index);
      const first = segments.at(startIndex);
      if (!first) return;
      const keys = new Set(segments.slice(startIndex).map(segment => segment.playableKey));
      runRef.current = {
        items: segments,
        keys,
        liveKey: first.playableKey,
        selectionKey: capturedKey,
      };
      for (const key of keys) {
        registry.setLastDynamicAi(key, false);
        const chapter = latest.current.sourceChapter;
        registry.setStaticAi(
          key,
          !!chapter && knownChapterTts(cache.peek(chapter), latest.current.licenceStatus)
        );
      }
      registry.setLive(first.playableKey);
      setItemServing({});
      const seed = record ? { forceTts: record.forceTts } : undefined;
      if (seek) {
        registry.clearRecord(first.playableKey);
        queueRef.current.playFrom(
          segments,
          startIndex,
          { fraction: seek.fraction },
          seekRecord ? { forceTts: seekRecord.forceTts } : undefined
        );
      } else if (record?.pendingFraction !== undefined) {
        registry.clearRecord(resumeKey ?? first.playableKey);
        queueRef.current.playFrom(segments, startIndex, { fraction: record.pendingFraction }, seed);
      } else if (bounded && segments.length === 1) {
        if (record) queueRef.current.playOne(first, record.currentTime, seed);
        else queueRef.current.playOne(first);
      } else if (record) {
        queueRef.current.playFrom(segments, startIndex, record.currentTime, seed);
      } else queueRef.current.playFrom(segments, startIndex);
    },
    [cache, enabled, pause, registry]
  );

  useEffect(() => facts?.subscribe(() => refreshFacts(version => version + 1)), [facts]);
  useEffect(() => {
    if (!facts || !textKey || !enabled) return;
    return facts.observe(textKey, () => refreshFacts(version => version + 1));
  }, [facts, textKey, enabled]);
  useEffect(() => {
    if (!facts || !soundingRecording) return;
    return facts.observe(soundingRecording.recordingKey, () =>
      refreshFacts(version => version + 1)
    );
  }, [facts, soundingRecording]);
  const previousPolicy = useRef({ selectionKey, observedStatus });
  const selectionKeys = useRef(new Map<string, Set<string>>());
  const slotSelections = useRef(new Map<string, string>());
  useLayoutEffect(() => {
    const previous = previousPolicy.current;
    previousPolicy.current = { selectionKey, observedStatus };
    const priorInSlot = slotSelections.current.get(selectionSlot);
    slotSelections.current.set(selectionSlot, selectionKey);
    const changedIdentity = priorInSlot !== undefined && priorInSlot !== selectionKey;
    const policyRevoked =
      previous.selectionKey === selectionKey &&
      previous.observedStatus === 'allowed' &&
      observedStatus !== 'allowed';
    if (previous.selectionKey !== selectionKey || policyRevoked) {
      if (changedIdentity || policyRevoked) stopWithoutRecord();
      else pause();
      cache.clear();
      if (changedIdentity || policyRevoked) {
        const invalidated = priorInSlot ?? selectionKey;
        preferredResumeKeysRef.current.delete(invalidated);
        for (const key of selectionKeys.current.get(invalidated) ?? []) {
          registry.clearRecord(key);
          registry.setImpossible(key, null);
        }
        selectionKeys.current.delete(invalidated);
      }
      setKnownChapter(undefined);
      lastChapterRef.current = null;
    }
  }, [selectionSlot, selectionKey, observedStatus, cache, pause, stopWithoutRecord, registry]);

  useLayoutEffect(() => {
    if (
      runRef.current?.items.some(item =>
        rows.some(row => row.verseRef === item.verseRef && row.unavailable)
      )
    )
      stopWithoutRecord();
  }, [rows, stopWithoutRecord]);

  const versePlayable = useCallback(
    (verseRef: string) => {
      const row = itemsRef.current.find(item => item.verseRef === verseRef);
      return row ? playablesFor([row]).at(0) : undefined;
    },
    [playablesFor]
  );

  const groupPlayable = useCallback(
    (verseRefs: readonly string[]) => {
      const wanted = new Set(verseRefs);
      if (rows.some(row => wanted.has(row.verseRef) && (row.loading || row.unavailable)))
        return undefined;
      const group = itemsRef.current.filter(item => wanted.has(item.verseRef));
      return playablesFor(group, JSON.stringify(group.map(item => item.verseRef))).at(0);
    },
    [playablesFor, rows]
  );

  const playBounded = useCallback(
    (playable: Playable | undefined) => {
      pressPrimary(disabledReason(playable), () => {
        if (!playable) return;
        // Deliberate reading: primary pauses, not resets.
        if (registry.isLive(playable.key)) registry.silenceAll();
        else startRun([playable], 0, true);
      });
    },
    [disabledReason, registry, startRun]
  );

  const playVerse = useCallback(
    (verseRef: string) => {
      playBounded(versePlayable(verseRef));
    },
    [playBounded, versePlayable]
  );

  const playFromVerse = useCallback(
    (verseRef: string) => {
      const pagePlayables = playablesFor(itemsRef.current);
      const segments = pagePlayables.flatMap(playable => playable.segments);
      const index = segments.findIndex(item => item.verseRef === verseRef);
      const liveKey = runRef.current?.liveKey ?? null;
      const preferredKey = preferredResumeKeysRef.current.get(latest.current.selectionKey) ?? null;
      const caretKey = versePlayable(verseRef)?.key ?? null;
      const resumeKey = [liveKey, preferredKey, caretKey].find(
        key =>
          key &&
          segments.some(segment => segment.playableKey === key) &&
          (key === liveKey || registry.getRecord(key))
      );
      const resumePlayable = pagePlayables.find(playable => playable.key === resumeKey);
      pressPrimary(disabledReason(resumePlayable ?? versePlayable(verseRef)), () => {
        if (index < 0 && !resumePlayable) return;
        startRun(pagePlayables, Math.max(0, index), false, undefined, resumeKey ?? undefined);
      });
    },
    [disabledReason, playablesFor, registry, startRun, versePlayable]
  );

  /**
   * G3a: pericope mode reads one group and stops there.
   *
   * No new playback mode was needed for this: `playFrom` stops at the end of
   * whatever array it is handed, so a bounded blob is simply a SHORTER array
   * built from the page's own document-ordered, playability-filtered items.
   */
  const liveGroupKey = useCallback(
    (verseRefs: readonly string[]) => {
      const group = groupPlayable(verseRefs);
      if (group && registry.isLive(group.key)) return group.key;
      for (const ref of verseRefs) {
        const verse = versePlayable(ref);
        if (verse && registry.isLive(verse.key)) return verse.key;
      }
      return null;
    },
    [groupPlayable, registry, versePlayable]
  );

  const playGroup = useCallback(
    (verseRefs: readonly string[]) => {
      if (liveGroupKey(verseRefs)) registry.silenceAll();
      else playBounded(groupPlayable(verseRefs));
    },
    [groupPlayable, liveGroupKey, playBounded, registry]
  );

  const playFromGroup = useCallback(
    (verseRefs: readonly string[]) => {
      const wanted = new Set(verseRefs);
      const pageItems = itemsRef.current;
      // The group's first playable row, located in the PAGE's list so the start
      // index is the queue's index and not a rendered-row count.
      const index = pageItems.findIndex(item => wanted.has(item.verseRef));
      if (index < 0) return; // nothing playable in this group (§5.1)

      startRun(playablesFor(pageItems), index);
    },
    [playablesFor, startRun]
  );

  const restart = useCallback(
    (playable: Playable | undefined) => {
      pressRestart(
        disabledReason(playable) === undefined && !!playable && registry.canRestart(playable.key),
        () => {
          if (!playable) return;
          const live = registry.isLive(playable.key);
          if (live) registry.silenceAll();
          registry.clearRecord(playable.key);
          if (live) startRun([playable], 0, true);
        }
      );
    },
    [disabledReason, registry, startRun]
  );

  // A live claim resolves its CURRENT playable at press time, not the caret or
  // the first verse of a run. Rebuild through the same factory as the buttons.
  restartLiveRef.current = () => {
    const run = runRef.current;
    if (!run || !registry.isLive(run.liveKey)) return;
    const refs = run.items
      .filter(item => item.playableKey === run.liveKey)
      .map(item => item.verseRef);
    const verse = refs[0] ? versePlayable(refs[0]) : undefined;
    restart(verse?.key === run.liveKey ? verse : groupPlayable(refs));
  };

  const stop = useCallback(() => {
    const key = runRef.current?.liveKey;
    stopWithoutRecord();
    if (key) registry.clearRecord(key);
  }, [registry, stopWithoutRecord]);

  const restartVerse = useCallback(
    (verseRef: string) => restart(versePlayable(verseRef)),
    [restart, versePlayable]
  );
  const restartGroup = useCallback(
    (verseRefs: readonly string[]) => {
      const playable = groupPlayable(verseRefs);
      if (!playable || disabledReason(playable) !== undefined) return;
      if (liveGroupKey(verseRefs)) {
        registry.silenceAll();
        registry.clearRecord(playable.key);
        startRun([playable], 0, true);
      } else restart(playable);
    },
    [disabledReason, groupPlayable, liveGroupKey, registry, restart, startRun]
  );
  const seekGroup = useCallback(
    (verseRefs: readonly string[], targetVerseRef: string, fraction: number) => {
      const playable = groupPlayable(verseRefs);
      if (!playable || disabledReason(playable) !== undefined) return;
      // The displayed run and a rebuilt bounded group need not have matching
      // indices. Carry the selected verse identity across that boundary.
      const index = playable.segments.findIndex(segment => segment.verseRef === targetVerseRef);
      if (index < 0) return;
      // Use the registry claim path so whichever player is sounding records its
      // own position before this group receives a distinct scrub intent.
      registry.silenceAll();
      const forceTts = registry.getRecord(playable.key)?.forceTts ?? false;
      registry.setRecord(playable.key, {
        itemIndex: index,
        verseRef: targetVerseRef,
        currentTime: 0,
        pendingFraction: Math.max(0, Math.min(1, fraction)),
        forceTts,
      });
      const capturedKey = latest.current.selectionKey;
      const keysForSelection = selectionKeys.current.get(capturedKey) ?? new Set<string>();
      keysForSelection.add(playable.key);
      selectionKeys.current.set(capturedKey, keysForSelection);
      preferredResumeKeysRef.current.set(latest.current.selectionKey, playable.key);
    },
    [disabledReason, groupPlayable, registry]
  );
  const playGroupAtVerse = useCallback(
    (verseRefs: readonly string[], verseRef: string) => {
      const playable = groupPlayable(verseRefs);
      pressPrimary(disabledReason(playable), () => {
        if (!playable) return;
        const record = registry.getRecord(playable.key);
        // A reference Bible can omit the caret verse. The jump is an extra,
        // never a reason to make an otherwise playable primary silently inert.
        const canSeekCaret = playable.segments.some(item => item.verseRef === verseRef);
        if (
          liveGroupKey(verseRefs) ||
          record?.pendingFraction !== undefined ||
          record?.verseRef === verseRef ||
          !canSeekCaret
        ) {
          playGroup(verseRefs);
        } else {
          const index = playable.segments.findIndex(item => item.verseRef === verseRef);
          startRun([playable], 0, true, { index, fraction: 0 });
        }
      });
    },
    [disabledReason, groupPlayable, liveGroupKey, playGroup, registry, startRun]
  );
  const playFromGroups = useCallback(
    (groups: ReadonlyArray<readonly string[]>, verseRef: string) => {
      const playables = groups.flatMap(refs => {
        const group = groupPlayable(refs);
        return group ? [group] : [];
      });
      const targetRefs = groups.find(refs => refs.includes(verseRef));
      const target = targetRefs ? groupPlayable(targetRefs) : undefined;
      const liveKey = runRef.current?.liveKey ?? null;
      const preferredKey = preferredResumeKeysRef.current.get(latest.current.selectionKey) ?? null;
      const resumeKey = [liveKey, preferredKey, target?.key].find(
        key =>
          key &&
          playables.some(playable => playable.key === key) &&
          (key === liveKey || registry.getRecord(key))
      );
      const resumeTarget = playables.find(playable => playable.key === resumeKey);
      pressPrimary(disabledReason(resumeTarget ?? target), () => {
        const startPlayable = resumeTarget ?? target;
        if (!startPlayable) return;
        const segments = playables.flatMap(group => group.segments);
        const caretIndex = segments.findIndex(item => item.verseRef === verseRef);
        const index =
          caretIndex >= 0
            ? caretIndex
            : segments.findIndex(item => item.playableKey === startPlayable.key);
        // Exactly the scrub start path, extended with the following full groups.
        // Their normal keys preserve controls, timing and pause records at boundaries.
        if (resumeKey) startRun(playables, 0, false, undefined, resumeKey);
        else startRun(playables, 0, false, { index, fraction: 0 });
      });
    },
    [disabledReason, groupPlayable, registry, startRun]
  );

  const currentSounding =
    soundingRecording?.selectionKey === selectionKey ? soundingRecording : null;
  const noticeFacts = currentSounding ? facts?.read(currentSounding.recordingKey, true) : undefined;
  const currentRecording =
    currentSounding && noticeFacts?.state === 'ready'
      ? {
          ...currentSounding,
          textBibleKey: textKey,
          notice: noticeFacts.facts.licenseNotice,
        }
      : null;
  const noticeUi = useRecordedNotice({
    scopeKey: selectionKey,
    textBibleKey:
      textKey ??
      (sourceChapter?.role === 'projectSource' ? `local-source:${sourceChapter.bibleId}` : null),
    textBibleName,
    recording: currentRecording
      ? {
          recordingKey: currentRecording.recordingKey,
          recordingName: currentRecording.recordingName,
          recordingProvider: currentRecording.provider,
          notice: currentRecording.notice,
          playableKey: currentRecording.playableKey,
        }
      : currentSounding
        ? {
            recordingKey: currentSounding.recordingKey,
            recordingName: currentSounding.recordingName,
            recordingProvider: currentSounding.provider,
            notice: null,
            noticePending: noticeFacts?.state === 'loading',
            playableKey: currentSounding.playableKey,
          }
        : null,
    isPlaying: queue.status === 'playing',
    enabled,
  });
  useEffect(() => {
    if (noticeUi.dialog) {
      queueRef.current.hold();
      return;
    }
    queueRef.current.resumeHeld();
  }, [noticeUi.dialog, queue.activeVerseRef, queue.status]);
  const verseKey = useCallback(
    (verseRef: string) => versePlayable(verseRef)?.key ?? null,
    [versePlayable]
  );
  const groupKey = useCallback(
    (verseRefs: readonly string[]) => groupPlayable(verseRefs)?.key ?? null,
    [groupPlayable]
  );

  const groupView = useCallback(
    (verseRefs: readonly string[]): PericopePlaybackView => {
      const group = groupPlayable(verseRefs);
      const liveKey = liveGroupKey(verseRefs);
      const isLive = liveKey !== null && queue.status !== 'idle';
      const verseItems = verseRefs.flatMap(ref => versePlayable(ref)?.segments ?? []);
      const verseKeys = new Set(verseItems.map(item => item.playableKey));
      const report = timing.report;
      // A verse run lights this range, while a bounded group has its own identity.
      const liveItems = isLive
        ? report?.items.filter(
            item => item.playableKey === group?.key || verseKeys.has(item.playableKey)
          )
        : undefined;
      const descriptors = liveItems?.length ? liveItems : (group?.segments ?? []);
      const record = group ? registry.getRecord(group.key) : null;
      const active = isLive ? report?.items[report.index] : undefined;
      const currentIndex = Math.max(
        0,
        active
          ? descriptors.findIndex(item => item.verseRef === active.verseRef)
          : (record?.itemIndex ?? 0)
      );
      const measurements = descriptors.map(item => timing.timingFor(item));
      const fileTime = isLive ? (report?.currentTime ?? 0) : (record?.currentTime ?? 0);
      const currentTime =
        isLive || record
          ? Math.max(0, fileTime - (measurements[currentIndex]?.startSeconds ?? 0))
          : 0;
      return {
        key: group?.key ?? null,
        isLive,
        impossibleReason: knownImpossibleReason(group),
        staticAi: verseItems.some(item => registry.getSnapshot(item.playableKey).staticAi),
        dynamicAi:
          isLive && [group?.key ?? '', ...verseKeys].some(key => queue.aiMarkedKeys.has(key)),
        segments: descriptors.map((item, index) => ({
          verseRef: item.verseRef,
          text: item.text,
          durationSeconds: measurements[index]?.durationSeconds ?? null,
          epoch: measurements[index]?.epoch ?? null,
        })),
        currentIndex,
        currentTime,
        pendingFraction: isLive ? report?.pendingFraction : record?.pendingFraction,
        recordedNotice: group?.key ? noticeUi.infoFor(group.key) : null,
      };
    },
    [
      groupPlayable,
      knownImpossibleReason,
      liveGroupKey,
      noticeUi,
      queue.aiMarkedKeys,
      queue.status,
      registry,
      timing,
      versePlayable,
    ]
  );

  // The page this host is showing, as of the last commit. Compared rather
  // than depended on, because the queue must be told about a page change
  // exactly once — on the render that changes it.
  const shownPageKeyRef = useRef(pageKey);

  // Nothing outlives the page it belongs to; see pageKey's option doc above.
  useEffect(() => {
    const shown = shownPageKeyRef.current;
    shownPageKeyRef.current = pageKey;

    if (shown !== pageKey) {
      stopWithoutRecord();
      preferredResumeKeysRef.current.clear();
    }
    registry.setPageKey(pageKey ?? '');
  }, [pageKey, registry, stopWithoutRecord]);

  // Release before the Provider's passive unmount silence loop: unmount stops
  // without writing a record, even when the whole app tree is removed together.
  useLayoutEffect(() => () => stopWithoutRecord(), [stopWithoutRecord]);

  // Rebuild static knowledge without fetching availability just for a badge.
  // The licence fence's eager half rides along: when a response is already
  // held, a barred Bible with no recording for a verse can never sound, so the
  // control says why before anyone presses it.
  useEffect(() => {
    const response = sourceChapter ? cache.peek(sourceChapter) : undefined;

    playablesFor(items).forEach((playable, index) => {
      const row = items[index];
      const rowChapter = sourceChapter
        ? { ...sourceChapter, chapter: row.chapterNumber ?? sourceChapter.chapter }
        : null;
      const rowResponse = rowChapter ? cache.peek(rowChapter) : undefined;
      registry.setStaticAi(playable.key, knownChapterTts(rowResponse, licenceStatus));

      // One playable per row, in row order, so the index pairs them.
      // A bar is only actionable once the recordings are known: until then the
      // verse may still be heard, so nothing is said about it.
      if (!sourceChapter || !rowResponse || (facts && facts.read(textKey).state !== 'ready')) {
        registry.setImpossible(playable.key, null);
        return;
      }
      const verdict = licenceVerdictForVerse(
        rowResponse,
        row.verseNumber,
        cache.supportsOpus,
        licenceStatus
      );
      registry.setImpossible(
        playable.key,
        verdict.bar === null || verdict.bar === 'unconfirmed' || verdict.recorded
          ? null
          : licenceBarReason(t, verdict.bar)
      );
    });
    if (sourceChapter && response) {
      noteLicenceBar(cache, pageKey ?? '', sourceChapter, response, licenceStatus);
    }
  }, [
    cache,
    facts,
    textKey,
    items,
    knownChapter,
    licenceStatus,
    pageKey,
    playablesFor,
    referenceBibleId,
    registry,
    sourceChapter,
    t,
  ]);

  useEffect(() => {
    if (queue.status === 'idle') finishRun();
  }, [finishRun, queue.status]);

  // A captured chapter response (including its media URLs) never outlives the page.
  useEffect(() => () => cache.clear(), [cache, pageKey]);

  // Turning the feature off takes live playback with it. Stopping an idle
  // queue is a no-op, which is the common case (every mount with the flag off).
  useEffect(() => {
    if (enabled) return;
    stopWithoutRecord();
  }, [enabled, stopWithoutRecord]);

  const playableRefs = useMemo(() => new Set(items.map(item => item.verseRef)), [items]);

  const isRowPlayable = useCallback(
    (verseRef: string) => playableRefs.has(verseRef),
    [playableRefs]
  );

  const isRowLoading = useCallback(
    (verseRef: string) => queue.itemStates[verseRef] === 'synthesizing',
    [queue.itemStates]
  );

  // The serving wash is a TTS diagnostic, not generic player state.
  useEffect(() => {
    if (queue.status === 'idle') setItemServing({});
  }, [queue.status]);

  const servingFor = useCallback((verseRef: string) => itemServing[verseRef], [itemServing]);

  /**
   * G3a: the group-level highlight, derived from the SAME `activeVerseRef` the
   * row highlight uses — which is what makes a display-mode switch mid-playback
   * safe to leave running: each layout can render the playing verse in its own
   * idiom without the queue knowing which layout is on screen.
   */
  const isGroupSpeaking = useCallback(
    (verseRefs: readonly string[]) =>
      queue.activeVerseRef !== null && verseRefs.includes(queue.activeVerseRef),
    [queue.activeVerseRef]
  );

  return {
    recording:
      queue.status === 'playing' && currentSounding
        ? (currentRecording ?? { ...currentSounding, textBibleKey: textKey, notice: null })
        : undefined,
    recordedNoticeDialog: noticeUi.dialog,
    closeRecordedNotice: noticeUi.close,
    showRecordedNotice: noticeUi.show,
    status: queue.status,
    aiMarkedKeys: queue.aiMarkedKeys,
    activeVerseRef: queue.activeVerseRef,
    isBusy: queue.status !== 'idle',
    isRowPlayable,
    isRowLoading,
    servingFor,
    playVerse,
    playFromVerse,
    playGroup,
    playGroupAtVerse,
    playFromGroups,
    playFromGroup,
    isGroupSpeaking,
    pause,
    stop,
    restartVerse,
    restartGroup,
    verseKey,
    groupKey,
    groupView,
    seekGroup,
  };
};
