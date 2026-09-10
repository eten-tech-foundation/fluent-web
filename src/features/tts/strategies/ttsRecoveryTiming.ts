/**
 * Proposed-default numbers (§6.1, flagged for review in the proposal). Named
 * in ONE place so retuning is a one-line change.
 */
export interface TtsRecoveryTiming {
  /** Max quiet retries per failure class per clip (CB1). */
  maxRetriesPerClass: number;
  /** Fixed backoff for mid-stream aborts (Retry-After governs 503s). */
  midStreamBackoffMs: number;
  /** Fallback delay when a 503 carries no usable Retry-After. */
  defaultRetryAfterMs: number;
  /** Stall watchdog: no progress/canplay within this window ⇒ stalled (N4). */
  stallWatchdogMs: number;
  /** Interval for the wait-for-compressed HEAD poll (N4). */
  stallPollIntervalMs: number;
  /** Defensive bound on wait-for-compressed polling (not in the proposal). */
  maxStallPolls: number;
}

export const DEFAULT_TTS_RECOVERY_TIMING: TtsRecoveryTiming = {
  maxRetriesPerClass: 2,
  midStreamBackoffMs: 1000,
  defaultRetryAfterMs: 2000,
  stallWatchdogMs: 4000,
  stallPollIntervalMs: 1000,
  maxStallPolls: 30,
};
