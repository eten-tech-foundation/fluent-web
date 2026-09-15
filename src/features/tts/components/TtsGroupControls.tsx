import { useEffect } from 'react';

import { useTranslation } from 'react-i18next';

import {
  type PericopePlaybackView,
  type SourceTtsPlaybackApi,
} from '../hooks/useSourceTtsPlayback';
import { buildSpans, calibratedEstimator, dotPosition, elapsedReadout } from '../lib/barGeometry';
import { useOffline } from '../lib/useOffline';
import { usePlayableState } from '../registry/usePlayableState';
import { usePlaybackRegistry } from '../registry/usePlaybackRegistry';

import { ScrubBar } from './ScrubBar';
import { TimeReadout } from './TimeReadout';
import { PlayableControl, type PlayableControlState } from './TtsVerseControls';

export interface PericopePlayerProps {
  groupLabel: string;
  verseRefs: readonly string[];
  playback: Pick<
    SourceTtsPlaybackApi,
    'status' | 'groupView' | 'playGroup' | 'restartGroup' | 'seekGroup'
  >;
}

function geometryFor(view: PericopePlaybackView) {
  const spans = buildSpans(view.segments);
  const durations = view.segments.map(segment => segment.durationSeconds);
  const epoch = view.segments[view.currentIndex]?.epoch;
  const estimator = calibratedEstimator(
    view.segments.map((segment, index) => ({
      characterCount: spans[index].characterCount,
      durationSeconds: segment.epoch === epoch ? segment.durationSeconds : null,
    }))
  );
  const span = spans.at(view.currentIndex);
  const pending = view.pendingFraction;
  const currentTime =
    pending !== undefined && span
      ? pending * (durations[view.currentIndex] ?? estimator.estimate(span.characterCount))
      : view.currentTime;
  const position =
    pending !== undefined && span
      ? span.start + pending * (span.end - span.start)
      : dotPosition(spans, view.currentIndex, currentTime, durations, estimator);
  const readout = elapsedReadout(spans, view.currentIndex, currentTime, durations, estimator);
  return {
    spans,
    position,
    elapsed: readout.seconds,
    estimated: readout.estimated || (pending !== undefined && durations[view.currentIndex] == null),
  };
}

/** Two-channel adapter: registry for idle facts, host-normalized timing for live playback. */
export function PericopePlayer({ groupLabel, verseRefs, playback }: PericopePlayerProps) {
  const { t } = useTranslation();
  const view = playback.groupView(verseRefs);
  const saved = usePlayableState(view.key ?? '');
  const registry = usePlaybackRegistry();
  const impossibleReason = saved.impossibleReason ?? view.impossibleReason ?? null;
  // This component owns the displayed grouping. Latch cheap host knowledge on
  // that exact identity, not only on the constituent verse keys.
  useEffect(() => {
    if (view.key && view.impossibleReason) {
      registry.setImpossible(view.key, view.impossibleReason);
    }
  }, [registry, view.impossibleReason, view.key]);
  const offline = useOffline();
  const geometry = geometryFor(view);
  const impossible = impossibleReason !== null;
  const state: PlayableControlState = offline
    ? 'offline'
    : impossible
      ? 'impossible'
      : view.isLive
        ? playback.status === 'loading'
          ? 'loading'
          : 'playing'
        : saved.record
          ? 'paused'
          : 'active';
  return (
    <div
      className='flex min-w-0 flex-1 items-center gap-2'
      data-live={view.isLive || undefined}
      data-testid='tts-group-controls'
    >
      <PlayableControl
        compact
        badge={
          saved.staticAi || view.staticAi || (view.isLive ? view.dynamicAi : saved.lastDynamicAi)
        }
        canRestart={view.isLive || saved.canRestart}
        disabled={view.key === null}
        impossibleReason={impossibleReason ?? undefined}
        label={t('ttsPericopeLabel', 'pericope {{groupLabel}}', { groupLabel })}
        playableKey={view.key ?? ''}
        state={state}
        onPrimary={() => playback.playGroup(verseRefs)}
        onRestart={() => playback.restartGroup(verseRefs)}
      />
      <ScrubBar
        disabled={offline || impossible || view.key === null}
        position={geometry.position}
        spans={geometry.spans}
        verseRefs={view.segments.map(segment => segment.verseRef)}
        onSeek={(index, fraction) => {
          const selected = view.segments.at(index);
          if (selected) playback.seekGroup(verseRefs, selected.verseRef, fraction);
        }}
      />
      <TimeReadout elapsed={geometry.elapsed} estimated={geometry.estimated} />
    </div>
  );
}
