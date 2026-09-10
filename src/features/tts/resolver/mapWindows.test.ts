import { describe, expect, it } from 'vitest';

import { bsbChapter, raggedChapter } from '../testing/sourceAudioFixtures';

import { mapWindows } from './mapWindows';

describe('mapWindows', () => {
  it('preserves all 36 measured windows in the live BSB John 3 capture', () => {
    const timestamps = bsbChapter().verseTimestamps!;
    const windows = mapWindows(timestamps);
    expect(windows.size).toBe(36);
    for (const stamp of timestamps)
      expect(windows.get(stamp.verse)).toEqual([stamp.startSeconds, stamp.endSeconds]);
  });

  it('closes a middle lone start and leaves only the final lone start open-ended', () => {
    expect([...mapWindows(raggedChapter().verseTimestamps!)]).toEqual([
      [1, [5, 10]],
      [2, [10, 15]],
      [4, [20]],
    ]);
  });

  it('orders timestamps without mutating the cached response and prefers explicit ends', () => {
    const timestamps = [
      { verse: 3, startSeconds: 30 },
      { verse: 1, startSeconds: 5, endSeconds: 8 },
      { verse: 2, startSeconds: 10 },
    ];
    expect([...mapWindows(timestamps)]).toEqual([
      [1, [5, 8]],
      [2, [10, 30]],
      [3, [30]],
    ]);
    expect(timestamps.map(stamp => stamp.verse)).toEqual([3, 1, 2]);
  });

  it('cannot close a lone start across an entry whose start is missing', () => {
    expect([
      ...mapWindows([{ verse: 1, startSeconds: 0 }, { verse: 2 }, { verse: 3, startSeconds: 10 }]),
    ]).toEqual([[3, [10]]]);
  });

  it('uses the next timestamped verse even when verse numbers are sparse', () => {
    expect([
      ...mapWindows([
        { verse: 1, startSeconds: 0 },
        { verse: 3, startSeconds: 10 },
      ]),
    ]).toEqual([
      [1, [0, 10]],
      [3, [10]],
    ]);
  });

  it('does not invent a start or a window without timestamps', () => {
    expect(mapWindows([]).size).toBe(0);
    expect(mapWindows([{ verse: 1, endSeconds: 5 }]).size).toBe(0);
  });

  it.each([0, -1, Number.NaN, Infinity])(
    'rejects an unusable end %s, never turning it into open-ended',
    endSeconds => {
      expect(mapWindows([{ verse: 1, startSeconds: 5, endSeconds }]).size).toBe(0);
    }
  );
});
