/**
 * Source-Text TTS — public surface (engine seam + queue + controls).
 *
 * Consumers depend on `TtsEngine`, never on fetch or a vendor (§6.1, T3/T5).
 */

export type {
  BudgetKey,
  ExhaustionAction,
  PlaybackOptions,
  PollRequests,
  RecoveryProbe,
  Playable,
  PlayableKey,
  PlaybackFailure,
  RecoveryRequests,
  RecoveryStrategy,
  Segment,
  Source,
  SourceThunk,
  SourceResolutionContext,
  PlaybackRunState,
  SupervisionPolicy,
} from './seam/types';

export {
  type TtsClip,
  type TtsServedFormat,
  type TtsEngine,
  type TtsFailureClass,
  type TtsFormat,
  type TtsQueueItem,
  type TtsRequest,
} from './tts.types';

export {
  TTS_MAX_PREFETCH_DEPTH,
  TTS_PREFETCH_DEPTH,
  type TtsPlaybackQueueApi,
  type PauseSnapshot,
  type TtsPlaybackStatus,
  type TtsQueueItemState,
  useTtsPlaybackQueue,
  type UseTtsPlaybackQueueOptions,
} from './hooks/useTtsPlaybackQueue';

export {
  TTS_KEYBOARD_SHORTCUTS,
  useTtsKeyboardShortcuts,
  type UseTtsKeyboardShortcutsOptions,
} from './hooks/useTtsKeyboardShortcuts';

export {
  type SourceTtsPlaybackApi,
  useSourceTtsPlayback,
  type UseSourceTtsPlaybackOptions,
} from './hooks/useSourceTtsPlayback';

export {
  PlayableControl,
  type PlayableControlProps,
  type PlayableControlState,
} from './components/TtsVerseControls';
export { SourceVerseControl } from './components/SourceVerseControl';

export { TtsGroupControls, type TtsGroupControlsProps } from './components/TtsGroupControls';

export {
  buildTtsQueueItems,
  findTtsQueueIndex,
  isPlayableRow,
  type TtsRowDraft,
} from './lib/buildTtsQueueItems';

export {
  TTS_CONTROL_BUTTON_CLASS,
  TTS_CONTROL_ROW_CLASS,
  TTS_CONTROL_STRIP_CLASS,
  VERSE_CONTROL_REVEAL_CLASS,
} from './lib/controlLayout';
export { ttsServingWashClass } from './lib/servingWash';

export {
  isRowFullyVisible,
  type ScrollableRow,
  scrollRowIntoViewIfNeeded,
  type ScrollViewport,
} from './lib/scrollRowIntoView';

export {
  RecordedRecoveryStrategy,
  type RecordedRecoveryStrategyOptions,
} from './strategies/recordedRecoveryStrategy';

export {
  TtsRecoveryStrategy,
  type TtsRecoveryStrategyOptions,
} from './strategies/ttsRecoveryStrategy';

export {
  canBrowserPlayOpus,
  DEFAULT_TTS_RECOVERY_TIMING,
  type FetchLike,
  ServerTtsEngine,
  type ServerTtsEngineOptions,
  type TtsRecoveryTiming,
} from './engines/serverTtsEngine';

export {
  fetchChapterSourceAudio,
  type ChapterSourceAudio,
  type ChapterSourceAudioRequest,
} from './resolver/sourceAudioClient';
export { ChapterAudioCache } from './resolver/chapterCache';
export {
  resolvePlayables,
  type RecordedRecoveryOptions,
  type SourceAudioRow,
  type SourceResolverContext,
} from './resolver/resolvePlayables';

export { PlaybackRegistryProvider } from './registry/PlaybackRegistryProvider';
export { type PlaybackRegistry } from './registry/PlaybackRegistryStore';
export { type PlayableState } from './registry/playbackRegistryState';
export { type PauseRecord } from './registry/pauseRecord';
export { usePlaybackRegistry } from './registry/usePlaybackRegistry';
export { usePlayableState } from './registry/usePlayableState';
export { useOffline } from './lib/useOffline';

export {
  type ClipAudioElement,
  type ClipAudioEventName,
  createClipAudioElement,
  onClipEvent,
  resetClipElement,
} from './lib/audioElement';
