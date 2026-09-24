import { describe, expect, it } from 'vitest';

import { formatClock } from './formatClock';

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [9.99, '0:09'],
    [59.999, '0:59'],
    [60, '1:00'],
    [125.7, '2:05'],
    [3600, '60:00'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });

  it.each([null, undefined, Number.NaN, Infinity, -Infinity, -1])(
    'does not invent a clock for %s',
    seconds => expect(formatClock(seconds)).toBe('--:--')
  );
});
