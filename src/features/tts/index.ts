/**
 * Source-Text TTS — public surface (engine seam + queue + controls).
 *
 * Consumers depend on `TtsEngine`, never on fetch or a vendor (§6.1, T3/T5).
 */

export {
  type TtsClip,
  type TtsServedFormat,
  type TtsEngine,
  type TtsFailureClass,
  type TtsFormat,
  TtsPlaybackError,
  type TtsQueueItem,
  type TtsRequest,
} from './tts.types';

export {
  TTS_MAX_PREFETCH_DEPTH,
  TTS_PREFETCH_DEPTH,
  type TtsPlaybackQueueApi,
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
  type TtsNextPage,
  useSourceTtsPlayback,
  type UseSourceTtsPlaybackOptions,
} from './hooks/useSourceTtsPlayback';

export { TtsVerseControls, type TtsVerseControlsProps } from './components/TtsVerseControls';

export { TtsGroupControls, type TtsGroupControlsProps } from './components/TtsGroupControls';

export { TtsBoundaryPrompt, type TtsBoundaryPromptProps } from './components/TtsBoundaryPrompt';

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
} from './lib/controlLayout';
export { ttsServingWashClass } from './lib/servingWash';
export {
  armTtsContinuation,
  claimTtsContinuation,
  disarmTtsContinuation,
  TTS_CONTINUATION_TTL_MS,
} from './lib/playbackContinuation';

export {
  isRowFullyVisible,
  type ScrollableRow,
  scrollRowIntoViewIfNeeded,
  type ScrollViewport,
} from './lib/scrollRowIntoView';

export {
  canBrowserPlayOpus,
  type ClipPlaybackSupervisionOptions,
  DEFAULT_TTS_RECOVERY_TIMING,
  type FetchLike,
  ServerTtsEngine,
  type ServerTtsEngineOptions,
  superviseClipPlayback,
  type TtsRecoveryTiming,
} from './engines/serverTtsEngine';

export {
  type ClipAudioElement,
  type ClipAudioEventName,
  createClipAudioElement,
  onClipEvent,
  resetClipElement,
} from './lib/audioElement';
