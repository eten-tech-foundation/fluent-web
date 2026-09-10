/** Caller-supplied identity for a playable, including page and source identity. */
export type PlayableKey = string;

/** Opaque retry bucket; the player counts it without interpreting its name. */
export type BudgetKey = string;

/** Whole media reference; a replacement URL always travels with its own window. */
export interface Source {
  url: string;
  /** Seconds in the file; a lone start deliberately plays to end-of-file. */
  window?: [number, number] | [number];
  durationMs?: number;
  durationIsMeasured: boolean;
}

/** One logical playback step, resolved eagerly or lazily by its resource resolver. */
export interface Segment {
  source: Source | (() => Promise<Source>);
  recovery: RecoveryStrategy;
  playableKey: PlayableKey;
  /** Host row identity for highlighting and scrolling; opaque to the player. */
  verseRef: string;
  /** Source-side text, available to synthesis and duration estimation. */
  text: string;
}

/** Ordered logical segments played under one caller-supplied identity. */
export interface Playable {
  key: PlayableKey;
  segments: Segment[];
}

/** Requests arbitrated and scheduled by the player, never executed inline by policy. */
export interface RecoveryRequests {
  /** Reload a whole source, charging the named bucket before resolving it. */
  play: (
    source: Segment['source'],
    charge: BudgetKey,
    opts?: { afterMs?: number; startOffset?: number }
  ) => void;
  /** Ask the strategy again later, under the player's poll ceiling. */
  poll: (charge: BudgetKey, afterMs: number) => void;
  /** Install the policy for the next source independently of replacing that source. */
  attach: (recovery: RecoveryStrategy) => void;
  /** Replace the source within this run and reset its retry counters. */
  handOff: (source: Segment['source'], reason: string) => void;
  /** End the run with a caller-visible reason when recovery cannot help. */
  giveUp: (reason: string) => void;
  /** Latch the AI indicator for this playable in the current run. */
  markAi: () => void;
}

/** Observed failure: the source rides along because the player returns what it was given, not a diagnosis. */
export type PlaybackFailure =
  | { on: 'error'; source: Segment['source']; positionMs: number; startedPlaying: boolean }
  | { on: 'stall'; source: Segment['source']; positionMs: number }
  | { on: 'endedEarly'; source: Segment['source']; positionMs: number };

/** Policy read when attaching supervision; all watchdog timers belong to the player. */
export interface SupervisionPolicy {
  readonly stallWatchdogMs: number | null;
}

/** Resource-specific recovery policy with no media element, timers or retry counters. */
export interface RecoveryStrategy {
  readonly supervision: SupervisionPolicy;
  recover: (
    failure: PlaybackFailure,
    requests: RecoveryRequests,
    signal: AbortSignal
  ) => Promise<void>;
}
