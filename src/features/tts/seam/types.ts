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

/** Run-owned storage: only the resolver interprets the sticky downgrade instruction. */
export interface PlaybackRunState {
  forceTts: boolean;
}

/** Context for lazy L2 resolution; no media element or retry counters cross this boundary. */
export interface SourceResolutionContext {
  signal: AbortSignal;
  run: Readonly<PlaybackRunState>;
  requests: Pick<RecoveryRequests, 'attach' | 'markAi'>;
}

/** The player invokes this lazily; source choice and policy attachment belong to L2. */
export type SourceThunk = (context: SourceResolutionContext) => Promise<Source>;

/** One logical playback step, resolved eagerly or lazily by its resource resolver. */
export interface Segment {
  source: Source | SourceThunk;
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

/** Position and delay are player instructions, not provider diagnostics. */
export interface PlaybackOptions {
  afterMs?: number;
  startOffset?: number;
}

/** An exhaustion continuation issues requests; it receives no budget facts. */
export type ExhaustionAction = () => void;

/** A granted polling episode can poll again or reload without a second retry charge. */
export interface PollRequests {
  play: (source: Segment['source'], opts?: PlaybackOptions) => void;
  poll: (afterMs: number) => void;
}

/** One provider probe, invoked by the player under its polling ceiling and signal. */
export type RecoveryProbe = (requests: PollRequests, signal: AbortSignal) => Promise<void>;

/** Requests arbitrated and scheduled by the player, never executed inline by policy. */
export interface RecoveryRequests {
  /** Reload a whole source, charging the named bucket before resolving it. */
  play: (
    source: Segment['source'],
    charge: BudgetKey,
    opts?: PlaybackOptions & { onExhausted?: ExhaustionAction }
  ) => void;
  /** Charge one retry, then schedule probes under a separate per-episode poll ceiling. */
  poll: (
    charge: BudgetKey,
    afterMs: number,
    probe: RecoveryProbe,
    opts?: { onExhausted?: ExhaustionAction; onPollExhausted?: ExhaustionAction }
  ) => void;
  /** Install the policy for the next source independently of replacing that source. */
  attach: (recovery: RecoveryStrategy) => void;
  /** Replace the source within this run and reset its retry counters. */
  handOff: (source: Segment['source'], reason: string) => void;
  /** End the run with a caller-visible reason when recovery cannot help. */
  giveUp: (reason: string) => void;
  /** Latch the AI indicator for this playable in the current run. */
  markAi: () => void;
}

/** Observed failure: return the resolved source that actually failed, never re-resolve it to diagnose it. */
export type PlaybackFailure =
  | { on: 'error'; source: Source; positionMs: number; startedPlaying: boolean }
  | { on: 'stall'; source: Source; positionMs: number }
  | { on: 'endedEarly'; source: Source; positionMs: number };

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
