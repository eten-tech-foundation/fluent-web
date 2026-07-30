/**
 * Source-Text TTS — public surface (phase: engine seam only, no UI yet).
 *
 * Consumers depend on `TtsEngine`, never on fetch or a vendor (§6.1, T3/T5).
 */

export {
  type TtsClip,
  type TtsEngine,
  type TtsFailureClass,
  type TtsFormat,
  type TtsPacing,
  TtsPlaybackError,
  type TtsRequest,
} from './tts.types';

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
