import { useEffect } from 'react';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  kind?: 'pericope' | 'chapter';
  verseRefs: readonly string[];
  playback: Pick<
    SourceTtsPlaybackApi,
    'status' | 'groupView' | 'playGroup' | 'restartGroup' | 'seekGroup' | 'showRecordedNotice'
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
export function PericopePlayer({
  groupLabel,
  kind = 'pericope',
  verseRefs,
  playback,
}: PericopePlayerProps) {
  const { t } = useTranslation();
  const playableLabel =
    kind === 'chapter'
      ? t('ttsChapterLabel', 'chapter {{groupLabel}}', { groupLabel })
      : t('ttsPericopeLabel', 'pericope {{groupLabel}}', { groupLabel });
  const view = playback.groupView(verseRefs);
  const saved = usePlayableState(view.key ?? '');
  const registry = usePlaybackRegistry();
  const impossibleReason =
    view.impossibleReason !== undefined ? view.impossibleReason : saved.impossibleReason;
  // This component owns the displayed grouping. Latch cheap host knowledge on
  // that exact identity, not only on the constituent verse keys.
  useEffect(() => {
    if (view.key && view.impossibleReason !== undefined) {
      registry.setImpossible(view.key, view.impossibleReason);
    }
  }, [registry, view.impossibleReason, view.key]);
  const offline = useOffline();
  const geometry = geometryFor(view);
  const recordedNotice = view.recordedNotice;
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
        label={playableLabel}
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
      {recordedNotice && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('recordedAudioInfo', 'Recording information for {{groupLabel}}', {
                  groupLabel: kind === 'chapter' ? playableLabel : groupLabel,
                })}
                className='text-muted-foreground size-10 shrink-0'
                size='icon'
                variant='ghost'
                onClick={() => playback.showRecordedNotice(recordedNotice)}
              >
                <Info aria-hidden='true' className='size-4' />
              </Button>
            </TooltipTrigger>
            <TooltipPrimitive.Portal>
              <TooltipContent className='z-20' side='bottom'>
                {t('recordedAudioNoticeTitle', 'Recording information')}
              </TooltipContent>
            </TooltipPrimitive.Portal>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
