import { type Segment, type Source } from '../seam/types';

/** Bare numbers always mean file-absolute seconds; only the tagged object is a ratio. */
export type PlaybackStart = number | { readonly fraction: number };

export interface SegmentTiming {
  readonly startSeconds: number;
  readonly durationSeconds: number | null;
  /** Only measurements from the same source timeline calibrate each other. */
  readonly epoch: number;
}

export interface TimingItem {
  readonly playableKey: string;
  readonly verseRef: string;
  readonly text: string;
}

/** Data only: no media, source, recovery or provider escapes into the host view model. */
export interface PlaybackTimingReport {
  readonly items: readonly TimingItem[];
  readonly index: number;
  readonly currentTime: number;
  /** User's tentative seek, held until initial metadata/the first actual landing. */
  readonly pendingFraction?: number;
  /** Undefined = not resolved here; null = explicitly invalidated by replacement. */
  readonly measurements: ReadonlyArray<SegmentTiming | null | undefined>;
}

const positive = (n: number | undefined): n is number =>
  n !== undefined && Number.isFinite(n) && n > 0;

export function sourceDuration(source: Source, mediaDuration?: number): number | null {
  const start = source.window?.[0] ?? 0;
  const end = source.window?.[1];
  if (end !== undefined) return positive(end - start) ? end - start : null;
  if (source.durationIsMeasured && positive(source.durationMs)) return source.durationMs / 1000;
  return positive(mediaDuration) && positive(mediaDuration - start) ? mediaDuration - start : null;
}

/** Convert only after lazy resolution. Unknown duration lands at this segment's start. */
export function resolvePlaybackStart(
  start: PlaybackStart | undefined,
  source: Source,
  durationSeconds: number | null
): number | undefined {
  if (typeof start !== 'object') return start;
  const fraction = Number.isFinite(start.fraction) ? Math.max(0, Math.min(1, start.fraction)) : 0;
  return (source.window?.[0] ?? 0) + fraction * (durationSeconds ?? 0);
}

let nextEpoch = 0;

/** Per-run measurement bookkeeping; never retained media or playback machinery. */
export class PlaybackTiming {
  private epoch = ++nextEpoch;
  private sources = new Map<number, Source>();
  private measurements: Array<SegmentTiming | null | undefined> = [];

  constructor(private readonly items: Segment[]) {}

  source(index: number, source: Source): void {
    const old = this.sources.get(index);
    if (
      old &&
      (old.url !== source.url ||
        old.window?.[0] !== source.window?.[0] ||
        old.window?.[1] !== source.window?.[1])
    ) {
      this.epoch = ++nextEpoch;
      // Completed durations remain exact history; replacement invalidates the rest.
      for (let i = index; i < this.items.length; i++) {
        this.sources.delete(i);
        this.measurements[i] = null;
      }
    }
    this.sources.set(index, source);
    this.measurements[index] = {
      startSeconds: source.window?.[0] ?? 0,
      durationSeconds: sourceDuration(source) ?? this.measurements[index]?.durationSeconds ?? null,
      epoch: this.epoch,
    };
  }

  measure(index: number, mediaDuration?: number, endedAt?: number): void {
    const source = this.sources.get(index);
    const previous = this.measurements[index];
    if (!source || !previous) return;
    const duration =
      sourceDuration(source, mediaDuration) ??
      (endedAt !== undefined && positive(endedAt - previous.startSeconds)
        ? endedAt - previous.startSeconds
        : null);
    if (duration !== null) this.measurements[index] = { ...previous, durationSeconds: duration };
  }

  duration(index: number): number | null {
    return this.measurements[index]?.durationSeconds ?? null;
  }

  report(index: number, currentTime: number): PlaybackTimingReport {
    return {
      // Re-read topology on every report, including after a boundary/replacement.
      items: this.items.map(({ playableKey, verseRef, text }) => ({ playableKey, verseRef, text })),
      index,
      currentTime,
      measurements: [...this.measurements],
    };
  }
}
