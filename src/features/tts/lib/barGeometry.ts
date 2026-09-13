/** Text-only bar coordinates. Media/window interpretation stays in the playback host. */
export interface BarSegment {
  readonly text: string;
}

export interface BarSpan {
  /** Normalized Unicode code points, not bytes, graphemes or an audio duration. */
  readonly characterCount: number;
  /** Coordinates in [0, 1], allocated before any media is resolved. */
  readonly start: number;
  readonly end: number;
}

/** Seconds, measured by the host; null/undefined/non-finite values are unknown. */
export type MeasuredDuration = number | null | undefined;

const isDuration = (value: MeasuredDuration): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Bootstrap guess only; tune from listening smoke tests, not a language/voice table. */
export const SECONDS_PER_CHAR = 0.06;

export const buildSpans = (segments: readonly BarSegment[]): BarSpan[] => {
  const counts = segments.map(
    segment => Array.from(segment.text.normalize('NFC').replace(/\s+/gu, ' ').trim()).length
  );
  const total = counts.reduce((sum, count) => sum + count, 0);
  let cursor = 0;
  return counts.map((characterCount, index) => {
    const start = cursor;
    // Empty text has no width unless ALL text is absent; then divide evenly.
    cursor += total > 0 ? characterCount / total : 1 / counts.length;
    return {
      characterCount,
      start,
      end: index === counts.length - 1 ? 1 : cursor,
    };
  });
};

/**
 * One instance per chunk. The host feeds measured durations, including metadata
 * available before playback, and resets on a new chunk or replacement segment list.
 * Re-measurement replaces a sample rather than counting repeated events twice.
 * No provider/kind, playback-rate adjustment, or cross-chunk history belongs here.
 */
export class Estimator {
  private readonly ratios = new Map<number, number>();

  measure(index: number, characterCount: number, durationSeconds: MeasuredDuration): void {
    if (!Number.isInteger(index) || index < 0) return;
    if (!Number.isFinite(characterCount) || characterCount <= 0 || !isDuration(durationSeconds)) {
      this.ratios.delete(index);
      return;
    }
    this.ratios.set(index, durationSeconds / characterCount);
  }

  get secondsPerCharacter(): number {
    if (this.ratios.size === 0) return SECONDS_PER_CHAR;
    // Arithmetic running mean of the per-segment ratios: each measured segment
    // contributes once, even if its duration is reported more than once.
    let sum = 0;
    for (const ratio of this.ratios.values()) sum += ratio;
    return sum / this.ratios.size;
  }

  estimate(characterCount: number): number {
    return Math.max(1, characterCount) * this.secondsPerCharacter;
  }

  reset(): void {
    this.ratios.clear();
  }
}

/**
 * currentTime is SEGMENT-LOCAL media seconds. The host subtracts a recording's
 * start before calling; neither a file-absolute pause offset nor a Source enters
 * this module. Returns the honest target, including backwards recovery/correction;
 * the slider renderer owns animation between targets, never span redistribution.
 */
export const dotPosition = (
  spans: readonly BarSpan[],
  index: number,
  currentTime: number,
  durations: readonly MeasuredDuration[],
  estimator: Estimator
): number => {
  if (!Number.isInteger(index) || index < 0) return 0;
  const span = spans.at(index);
  if (!span) return 0;
  const measured = durations[index];
  const duration = isDuration(measured) ? measured : estimator.estimate(span.characterCount);
  const elapsed = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const fraction = Math.min(1, elapsed / duration);
  return span.start + fraction * (span.end - span.start);
};

/**
 * Exact elapsed media seconds, never an estimate. Prior measurements may come
 * from completed clips or metadata; a forward seek across any unknown yields null.
 * currentTime is segment-local, as for dotPosition; no playbackRate multiplier.
 */
export const elapsedSeconds = (
  index: number,
  currentTime: number,
  durations: readonly MeasuredDuration[]
): number | null => {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > durations.length ||
    !Number.isFinite(currentTime) ||
    currentTime < 0
  ) {
    return null;
  }
  let elapsed = currentTime;
  for (let prior = 0; prior < index; prior++) {
    const duration = durations[prior];
    if (!isDuration(duration)) return null;
    elapsed += duration;
  }
  return elapsed;
};
