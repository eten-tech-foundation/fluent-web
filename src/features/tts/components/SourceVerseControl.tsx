import { useTranslation } from 'react-i18next';

import { type SourceTtsPlaybackApi } from '../hooks/useSourceTtsPlayback';
import { useOffline } from '../lib/useOffline';
import { usePlayableState } from '../registry/usePlayableState';

import { PlayableControl, type PlayableControlState } from './TtsVerseControls';

interface SourceVerseControlProps {
  verseRef: string;
  playback: Pick<
    SourceTtsPlaybackApi,
    'status' | 'aiMarkedKeys' | 'verseKey' | 'playVerse' | 'restartVerse'
  >;
}

/** The two-channel adapter: no source, provider, format or media inspection. */
export function SourceVerseControl({ verseRef, playback }: SourceVerseControlProps) {
  const { t } = useTranslation();
  const key = playback.verseKey(verseRef);
  const saved = usePlayableState(key ?? '');
  const offline = useOffline();
  const state: PlayableControlState = offline
    ? 'offline'
    : saved.impossibleReason
      ? 'impossible'
      : saved.isLive
        ? playback.status === 'loading'
          ? 'loading'
          : 'playing'
        : saved.record
          ? 'paused'
          : 'active';
  const badge =
    saved.staticAi || (saved.isLive ? playback.aiMarkedKeys.has(key ?? '') : saved.lastDynamicAi);

  return (
    <div data-testid='tts-verse-controls'>
      <PlayableControl
        badge={badge}
        canRestart={saved.canRestart}
        disabled={key === null}
        impossibleReason={saved.impossibleReason ?? undefined}
        label={t('ttsVerseLabel', 'verse {{verseRef}}', { verseRef })}
        playableKey={key ?? ''}
        state={state}
        onPrimary={() => playback.playVerse(verseRef)}
        onRestart={() => playback.restartVerse(verseRef)}
      />
    </div>
  );
}
