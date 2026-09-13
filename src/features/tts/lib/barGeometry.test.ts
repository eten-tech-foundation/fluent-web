import { describe, expect, it } from 'vitest';

import {
  buildSpans,
  dotPosition,
  elapsedSeconds,
  Estimator,
  SECONDS_PER_CHAR,
} from './barGeometry';

const segments = (...lengths: number[]) => lengths.map(length => ({ text: 'a'.repeat(length) }));

describe('buildSpans', () => {
  it('allocates the entire bar in proportion to text, before any audio exists', () => {
    expect(buildSpans(segments(10, 20, 10))).toEqual([
      { characterCount: 10, start: 0, end: 0.25 },
      { characterCount: 20, start: 0.25, end: 0.75 },
      { characterCount: 10, start: 0.75, end: 1 },
    ]);
  });

  it('counts normalized Unicode code points and collapses incidental whitespace', () => {
    const spans = buildSpans([{ text: '  e\u0301\n\t😀  ' }, { text: 'abc' }]);
    expect(spans.map(span => span.characterCount)).toEqual([3, 3]);
    expect(spans[0].end).toBe(0.5);
  });

  it('handles empty lists, empty text among text, and a wholly textless recording', () => {
    expect(buildSpans([])).toEqual([]);
    expect(buildSpans([{ text: '' }, { text: 'abc' }])).toEqual([
      { characterCount: 0, start: 0, end: 0 },
      { characterCount: 3, start: 0, end: 1 },
    ]);
    expect(buildSpans(segments(0, 0)).map(({ start, end }) => [start, end])).toEqual([
      [0, 0.5],
      [0.5, 1],
    ]);
  });

  it('shares boundaries and finishes exactly at one even with repeating fractions', () => {
    const spans = buildSpans(segments(1, 1, 1, 1, 1, 1, 1));
    expect(spans[0].start).toBe(0);
    expect(spans.at(-1)?.end).toBe(1);
    for (let index = 1; index < spans.length; index++) {
      expect(spans[index].start).toBe(spans[index - 1].end);
    }
  });
});

describe('Estimator', () => {
  it('boots cold, calibrates from any measured segment, and averages segment ratios', () => {
    const estimator = new Estimator();
    expect(estimator.estimate(100)).toBe(100 * SECONDS_PER_CHAR);
    // Metadata can arrive for a later segment before the current one ends.
    estimator.measure(2, 100, 10);
    expect(estimator.estimate(100)).toBe(10);
    estimator.measure(0, 200, 40);
    expect(estimator.secondsPerCharacter).toBeCloseTo(0.15);
    expect(estimator.estimate(100)).toBeCloseTo(15);
  });

  it('replaces repeated/re-measured samples, never double-weights them', () => {
    const estimator = new Estimator();
    estimator.measure(0, 100, 10);
    estimator.measure(1, 100, 30);
    estimator.measure(1, 100, 30);
    expect(estimator.estimate(100)).toBe(20);
    estimator.measure(1, 100, 10);
    expect(estimator.estimate(100)).toBe(10);
  });

  it('resets to cold for a new chunk or replacement segment list', () => {
    const estimator = new Estimator();
    estimator.measure(0, 100, 40);
    estimator.reset();
    expect(estimator.secondsPerCharacter).toBe(SECONDS_PER_CHAR);
    estimator.measure(0, 100, 10);
    expect(estimator.estimate(100)).toBe(10);
  });

  it.each([undefined, null, Number.NaN, Infinity, -Infinity, 0, -1])(
    'does not calibrate from an unmeasured/invalid duration %s',
    duration => {
      const estimator = new Estimator();
      estimator.measure(0, 100, 10);
      estimator.measure(0, 100, duration);
      expect(estimator.secondsPerCharacter).toBe(SECONDS_PER_CHAR);
    }
  );

  it('ignores unusable text counts and invalid sample indices', () => {
    const estimator = new Estimator();
    for (const count of [0, -1, Number.NaN, Infinity]) estimator.measure(0, count, 10);
    for (const index of [-1, 1.5, Number.NaN, Infinity]) estimator.measure(index, 100, 10);
    expect(estimator.secondsPerCharacter).toBe(SECONDS_PER_CHAR);
    expect(estimator.estimate(0)).toBe(SECONDS_PER_CHAR);
  });
});

describe('dotPosition', () => {
  it('class-1 and class-2 corrections move only the dot inside a fixed span', () => {
    const input = segments(100, 300);
    const spans = buildSpans(input);
    const original = structuredClone(spans);
    const estimator = new Estimator();
    const before = dotPosition(spans, 0, 3, [], estimator);
    expect(before).toBeCloseTo(0.125);
    estimator.measure(0, 100, 12);
    expect(dotPosition(spans, 0, 3, [12], estimator)).toBeCloseTo(0.0625);
    estimator.measure(0, 100, 6);
    expect(dotPosition(spans, 0, 3, [6], estimator)).toBeCloseTo(before);
    expect(spans).toEqual(original);
    expect(buildSpans(input)).toEqual(original);
  });

  it('clamps at the current span end in both cold and calibrated regimes', () => {
    const spans = buildSpans(segments(100, 100));
    const estimator = new Estimator();
    expect(dotPosition(spans, 0, 999, [], estimator)).toBe(0.5);
    estimator.measure(1, 100, 20);
    expect(dotPosition(spans, 0, 10, [], estimator)).toBe(0.25);
    expect(dotPosition(spans, 0, 999, [], estimator)).toBe(0.5);
    expect(dotPosition(spans, 1, 999, [undefined, 20], estimator)).toBe(1);
  });

  it('class-3 recovery honestly retreats to the segment start', () => {
    const spans = buildSpans(segments(100, 100));
    const estimator = new Estimator();
    expect(dotPosition(spans, 1, 6, [12, 12], estimator)).toBe(0.75);
    expect(dotPosition(spans, 1, 0, [12, 12], estimator)).toBe(0.5);
  });

  it('uses segment-local media seconds for a recorded window, not chapter time', () => {
    const spans = buildSpans(segments(100, 100));
    // Host converted a [30, 40] recording window and file position 35 to 10 and 5.
    expect(dotPosition(spans, 1, 5, [10, 10], new Estimator())).toBe(0.75);
  });

  it('re-spans a one-segment resource into three after fallback without retaining old geometry', () => {
    const estimator = new Estimator();
    const original = buildSpans(segments(600));
    estimator.measure(0, 600, 60);
    expect(dotPosition(original, 0, 30, [60], estimator)).toBe(0.5);
    const replacement = buildSpans(segments(100, 200, 300));
    estimator.reset(); // The host invalidates old measurements when replacing the list.
    expect(dotPosition(replacement, 0, 0, [], estimator)).toBe(0);
    expect(dotPosition(replacement, 2, 9, [], estimator)).toBeCloseTo(0.75);
    expect(replacement.map(span => span.end)).toEqual([1 / 6, 0.5, 1]);
    expect(dotPosition(replacement, 99, 0, [], estimator)).toBe(0);
    expect(dotPosition([], 0, 0, [], estimator)).toBe(0);
  });

  it('handles indeterminate streaming duration and invalid media positions without NaN', () => {
    const spans = buildSpans(segments(100));
    const estimator = new Estimator();
    for (const duration of [undefined, null, Number.NaN, Infinity, 0, -1]) {
      expect(dotPosition(spans, 0, 3, [duration], estimator)).toBe(0.5);
    }
    for (const time of [Number.NaN, Infinity, -Infinity, -1]) {
      expect(dotPosition(spans, 0, time, [], estimator)).toBe(0);
    }
  });
});

describe('elapsedSeconds', () => {
  it('is exact during a first listen without the current segment duration', () => {
    expect(elapsedSeconds(0, 3.5, [])).toBe(3.5);
    expect(elapsedSeconds(1, 2.25, [6.5, undefined])).toBe(8.75);
    expect(elapsedSeconds(2, 4, [6.5, 3.5, undefined])).toBe(14);
    expect(elapsedSeconds(3, 0, [6.5, 3.5, 4])).toBe(14);
  });

  it('does not need an estimate, completion flag, current duration or playback-rate adjustment', () => {
    expect(elapsedSeconds(2, 5, [10, 20, undefined])).toBe(35);
    // A seek across known metadata is still exact, even without playing those clips.
    expect(elapsedSeconds(2, 0, [10, 20])).toBe(30);
  });

  it.each([undefined, null, Number.NaN, Infinity, 0, -1])(
    'is unknown after a forward seek across duration %s',
    duration => expect(elapsedSeconds(2, 5, [10, duration, undefined])).toBeNull()
  );

  it('becomes exact again on seeking back before the gap or measuring it', () => {
    expect(elapsedSeconds(2, 5, [10, undefined, 30])).toBeNull();
    expect(elapsedSeconds(1, 5, [10, undefined, 30])).toBe(15);
    expect(elapsedSeconds(2, 5, [10, 20, 30])).toBe(35);
  });

  it('rejects invalid indices and media time rather than displaying plausible elapsed', () => {
    for (const index of [-1, 0.5, 2, Number.NaN, Infinity]) {
      expect(elapsedSeconds(index, 0, [10])).toBeNull();
    }
    for (const time of [-1, Number.NaN, Infinity]) {
      expect(elapsedSeconds(0, time, [])).toBeNull();
    }
  });
});
