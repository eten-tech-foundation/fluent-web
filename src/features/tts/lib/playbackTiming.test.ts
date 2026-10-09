import { describe, expect, it } from 'vitest';

import { type Segment, type Source } from '../seam/types';

import { PlaybackTiming, resolvePlaybackStart, sourceDuration } from './playbackTiming';

const source: Source = {
  url: 'opaque',
  window: [40, 50],
  durationIsMeasured: true,
  durationMs: 10000,
};
const item = { playableKey: 'group', verseRef: '1', text: 'text', source } as Segment;

describe('playback timing and explicit seek units', () => {
  it('never confuses half a second with halfway through the selected segment', () => {
    expect(resolvePlaybackStart(0.5, source, 10)).toBe(0.5);
    expect(resolvePlaybackStart({ fraction: 0.5 }, source, 10)).toBe(45);
    expect(resolvePlaybackStart({ fraction: 0.5 }, { ...source, window: undefined }, 10)).toBe(5);
    expect(resolvePlaybackStart(undefined, source, 10)).toBeUndefined();
    expect(resolvePlaybackStart({ fraction: 0.5 }, source, null)).toBe(40);
  });
  it('measures windows, finite metadata and streaming completion without a format check', () => {
    expect(sourceDuration(source, 100)).toBe(10);
    expect(sourceDuration({ ...source, window: [40], durationMs: undefined }, 100)).toBe(60);
    const timeline = new PlaybackTiming([item]);
    timeline.source(0, { url: 'opaque', durationIsMeasured: false });
    timeline.measure(0, Infinity);
    expect(timeline.duration(0)).toBeNull();
    timeline.measure(0, NaN, 8);
    expect(timeline.duration(0)).toBe(8);
  });
  it('keeps completed elapsed history but invalidates replacement and future measurements', () => {
    const items = [item, { ...item, verseRef: '2' }, { ...item, verseRef: '3' }];
    const timeline = new PlaybackTiming(items);
    items.forEach((_, i) => timeline.source(i, source));
    const before = timeline.report(1, 42);
    timeline.source(1, { url: 'replacement', durationIsMeasured: false });
    const after = timeline.report(1, 0);
    expect(after.measurements[0]).toEqual(before.measurements[0]);
    expect(after.measurements[1]?.epoch).not.toBe(before.measurements[1]?.epoch);
    expect(after.measurements[1]?.durationSeconds).toBeNull();
    expect(after.measurements[2]).toBeNull();
    expect(before.measurements[2]?.durationSeconds).toBe(10);
    items.push({ ...item, verseRef: '4' });
    expect(timeline.report(1, 0).items).toHaveLength(4);
  });
});
