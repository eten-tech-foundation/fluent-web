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
import { createTtsSegment } from '../lib/createTtsSegment';
import {
  type ScrollableRow,
  scrollRowIntoViewIfNeeded,
  type ScrollViewport,
} from '../lib/scrollRowIntoView';
import { useOffline } from '../lib/useOffline';
import { writeRecord } from '../registry/pauseRecord';
import { usePlaybackRegistry } from '../registry/usePlaybackRegistry';
import { ChapterAudioCache } from '../resolver/chapterCache';
import { resolvePlayables, type SourceAudioRow } from '../resolver/resolvePlayables';
import { type ChapterSourceAudioRequest } from '../resolver/sourceAudioClient';
import { type Playable, type Segment } from '../seam/types';
import { RecordedRecoveryStrategy } from '../strategies/recordedRecoveryStrategy';
import { type TtsEngine, type TtsServedFormat } from '../tts.types';

import { usePlaybackTiming } from './usePlaybackTiming';
import { type TtsPlaybackStatus, useTtsPlaybackQueue } from './useTtsPlaybackQueue';

export interface UseSourceTtsPlaybackOptions {
  engine: TtsEngine;
  /** Rows in the order they are read on screen; unplayable ones may be included. */
  rows: readonly SourceAudioRow[];
  /** Null for reference-panel text: its provider identity is not a Fluent Bible id. */
  sourceChapter: ChapterSourceAudioRequest | null;
  /** Domain-qualified reference selection identity; never used to select an audio provider. */
  referenceBibleId: string | null;
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
}

export interface SourceTtsPlaybackApi {
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
}

export const useSourceTtsPlayback = (
  options: UseSourceTtsPlaybackOptions
): SourceTtsPlaybackApi => {
  const {
    engine,
    rows,
    sourceChapter,
    referenceBibleId,
    getRowElement,
    getViewport,
    pageKey,
    enabled = true,
  } = options;
  const { t } = useTranslation();
  const registry = usePlaybackRegistry();
  const offline = useOffline();
  const restartLiveRef = useRef<() => void>(() => {});
  const disabledReason = useCallback(
    (playable: Playable | undefined) =>
      unavailableReason(t, {
        offline,
        missing: !playable,
        impossibleReason: playable ? registry.getSnapshot(playable.key).impossibleReason : null,
      }),
    [offline, registry, t]
  );
  const runRef = useRef<HostRun | null>(null);
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
    referenceBibleId,
  });
  latest.current = { getRowElement, getViewport, engine, pageKey, sourceChapter, referenceBibleId };
  const [cache] = useState(() => new ChapterAudioCache());
  const [itemServing, setItemServing] = useState<Record<string, TtsServedFormat>>({});
  const playablesFor = useCallback(
    (sourceRows: readonly SourceAudioRow[], pericopeId?: string): Playable[] => {
      const {
        engine: currentEngine,
        pageKey: currentPage,
        sourceChapter: chapter,
        referenceBibleId: referenceId,
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
        });
      }
      // Reference Bibles still use their own text/language. Never resolve their
      // recording using the project's Bible id; provider identity wiring is separate.
      if (referenceId === null) return [];
      const groups = pericopeId === undefined ? sourceRows.map(row => [row]) : [sourceRows];
      return groups
        .filter(group => group.length > 0)
        .map(group => {
          const key = JSON.stringify([
            construction.pageKey,
            'referenceBible',
            referenceId,
            pericopeId ?? group[0].verseRef,
            group.map(row => [row.verseNumber, row.langCode, row.text]),
          ]);
          return {
            key,
            segments: group.map(row =>
              createTtsSegment(
                { ...row, text: (row.text ?? '').trim(), langCode: row.langCode || undefined },
                { ...construction, playableKey: key }
              )
            ),
          };
        });
    },
    [cache]
  );

  // Text holes remain disabled in this text-drafting host. The resolver itself
  // accepts text-free rows for future audio-only surfaces.
  const items = useMemo(() => rows.filter(isPlayableRow), [rows]);
  const itemsRef = useRef<readonly SourceAudioRow[]>(items);
  itemsRef.current = items;

  const handleScrollRequest = useCallback(
    (verseRef: string) => {
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
    [registry]
  );

  const handleError = useCallback(
    (_error: Error, item: Segment) => {
      // §5.2: a failure the listener can see, in their language, naming the
      // verse — not a silent stop and not a raw engine message. The engine's
      // own message is deliberately unused: it is diagnostic, not user-facing.
      toast.error(
        t('ttsPlaybackFailed', 'Could not play audio for verse {{verseRef}}. Please try again.', {
          verseRef: item.verseRef,
        })
      );
    },
    [t]
  );

  const queue = useTtsPlaybackQueue({
    onTiming: timing.onTiming,
    onError: (error, segment) => {
      finishRun();
      handleError(error, segment);
    },
    onAutoplayRefused: (snapshot, segment) => {
      writeRecord(registry, snapshot);
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
    const snapshot = queueRef.current.pause();
    if (snapshot) writeRecord(registry, snapshot);
    finishRun();
  }, [finishRun, registry]);

  const stopWithoutRecord = useCallback(() => {
    queueRef.current.stop();
    finishRun();
  }, [finishRun]);

  const startRun = useCallback(
    (
      playables: Playable[],
      index = 0,
      bounded = false,
      seek?: { index: number; fraction: number }
    ) => {
      if (!enabled) return;
      const segments = playables.flatMap(playable => playable.segments);
      const first = segments.at(seek?.index ?? index);
      if (!first) return;
      // The claim pauses AND records synchronously, before reading resume data.
      const previousKey = runRef.current?.liveKey;
      const previousIsInTarget = runRef.current?.items.some(
        item =>
          item.playableKey === previousKey &&
          segments.some(target => target.verseRef === item.verseRef)
      );
      releaseRef.current = registry.claim(pause, () => restartLiveRef.current());
      const record = bounded ? registry.getRecord(first.playableKey) : null;
      // A seek within this playable keeps its fallback instruction, but seeking
      // a different pericope must not inherit another playable's fallback voice.
      const seekRecord =
        record ?? (previousKey && previousIsInTarget ? registry.getRecord(previousKey) : null);
      const startIndex = seek?.index ?? record?.itemIndex ?? index;
      const keys = new Set(segments.slice(startIndex).map(segment => segment.playableKey));
      runRef.current = { items: segments, keys, liveKey: first.playableKey };
      for (const key of keys) {
        registry.setLastDynamicAi(key, false);
        const chapter = latest.current.sourceChapter;
        registry.setStaticAi(key, !chapter || cache.peek(chapter)?.verseAddressable === false);
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
      } else if (bounded && segments.length === 1) {
        if (record) queueRef.current.playOne(first, record.currentTime, seed);
        else queueRef.current.playOne(first);
      } else if (record) {
        queueRef.current.playFrom(segments, startIndex, record.currentTime, seed);
      } else queueRef.current.playFrom(segments, startIndex);
    },
    [cache, enabled, pause, registry]
  );

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
      const group = itemsRef.current.filter(item => wanted.has(item.verseRef));
      return playablesFor(group, JSON.stringify(group.map(item => item.verseRef))).at(0);
    },
    [playablesFor]
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
      const index = itemsRef.current.findIndex(item => item.verseRef === verseRef);
      pressPrimary(disabledReason(versePlayable(verseRef)), () => {
        if (index < 0) return;
        // A range has no persistent identity; recreate it from the caret.
        startRun(playablesFor(itemsRef.current), index);
      });
    },
    [disabledReason, playablesFor, startRun, versePlayable]
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
      startRun([playable], 0, true, { index, fraction });
    },
    [disabledReason, groupPlayable, startRun]
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
        if (liveGroupKey(verseRefs) || record?.verseRef === verseRef || !canSeekCaret) {
          playGroup(verseRefs);
        } else seekGroup(verseRefs, verseRef, 0);
      });
    },
    [disabledReason, groupPlayable, liveGroupKey, playGroup, registry, seekGroup]
  );
  const playFromGroups = useCallback(
    (groups: ReadonlyArray<readonly string[]>, verseRef: string) => {
      const playables = groups.flatMap(refs => {
        const group = groupPlayable(refs);
        return group ? [group] : [];
      });
      const targetRefs = groups.find(refs => refs.includes(verseRef));
      const target = targetRefs ? groupPlayable(targetRefs) : undefined;
      pressPrimary(disabledReason(target), () => {
        if (!target) return;
        const segments = playables.flatMap(group => group.segments);
        const caretIndex = segments.findIndex(item => item.verseRef === verseRef);
        const index =
          caretIndex >= 0
            ? caretIndex
            : segments.findIndex(item => item.playableKey === target.key);
        // Exactly the scrub start path, extended with the following full groups.
        // Their normal keys preserve controls, timing and pause records at boundaries.
        startRun(playables, 0, false, { index, fraction: 0 });
      });
    },
    [disabledReason, groupPlayable, startRun]
  );
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
        pendingFraction: isLive ? report?.pendingFraction : undefined,
      };
    },
    [groupPlayable, liveGroupKey, queue.aiMarkedKeys, queue.status, registry, timing, versePlayable]
  );

  // The page this host is showing, as of the last commit. Compared rather
  // than depended on, because the queue must be told about a page change
  // exactly once — on the render that changes it.
  const shownPageKeyRef = useRef(pageKey);

  // Nothing outlives the page it belongs to; see pageKey's option doc above.
  useEffect(() => {
    const shown = shownPageKeyRef.current;
    shownPageKeyRef.current = pageKey;

    if (shown !== pageKey) stopWithoutRecord();
    registry.setPageKey(pageKey ?? '');
  }, [pageKey, registry, stopWithoutRecord]);

  // Release before the Provider's passive unmount silence loop: unmount stops
  // without writing a record, even when the whole app tree is removed together.
  useLayoutEffect(() => () => stopWithoutRecord(), [stopWithoutRecord]);

  // Rebuild static knowledge without fetching availability just for a badge.
  useEffect(() => {
    const knownTts = !sourceChapter || cache.peek(sourceChapter)?.verseAddressable === false;
    for (const playable of playablesFor(items)) registry.setStaticAi(playable.key, knownTts);
  }, [cache, items, pageKey, playablesFor, referenceBibleId, registry, sourceChapter]);

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
