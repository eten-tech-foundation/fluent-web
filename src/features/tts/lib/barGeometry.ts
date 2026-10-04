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

const meanRatio = (ratios: readonly number[]): number =>
  ratios.length ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : SECONDS_PER_CHAR;

export interface DurationEstimator {
  estimate: (characterCount: number) => number;
}

/** Immutable snapshot for render-time geometry: no effects, shared mutation or stale frame. */
export const calibratedEstimator = (
  samples: ReadonlyArray<{ characterCount: number; durationSeconds: MeasuredDuration }>
): DurationEstimator => {
  const ratios = samples.flatMap(({ characterCount, durationSeconds }) =>
    Number.isFinite(characterCount) && characterCount > 0 && isDuration(durationSeconds)
      ? [durationSeconds / characterCount]
      : []
  );
  const ratio = meanRatio(ratios);
  return { estimate: characterCount => Math.max(1, characterCount) * ratio };
};

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

/** Map a text coordinate to an explicitly segment-local fraction. */
export function segmentAt(spans: readonly BarSpan[], position: number) {
  const point = Math.max(0, Math.min(1, position));
  const found = spans.findIndex(span => span.end > point);
  const index = found < 0 ? Math.max(0, spans.length - 1) : found;
  const span = spans.at(index);
  return {
    index,
    fraction: span && span.end > span.start ? (point - span.start) / (span.end - span.start) : 0,
  };
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
  estimator: DurationEstimator
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

/** Elapsed-only estimate when a seek skipped unmeasured segments; never a total forecast. */
export const elapsedReadout = (
  spans: readonly BarSpan[],
  index: number,
  currentTime: number,
  durations: readonly MeasuredDuration[],
  estimator: DurationEstimator
): { seconds: number | null; estimated: boolean } => {
  const exact = elapsedSeconds(index, currentTime, durations);
  if (exact !== null) return { seconds: exact, estimated: false };
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= spans.length ||
    !Number.isFinite(currentTime) ||
    currentTime < 0
  )
    return { seconds: null, estimated: false };
  let seconds = currentTime;
  for (let prior = 0; prior < index; prior++) {
    const duration = durations[prior];
    seconds += isDuration(duration) ? duration : estimator.estimate(spans[prior].characterCount);
  }
  return { seconds, estimated: true };
};
