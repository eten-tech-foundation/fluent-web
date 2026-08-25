import { describe, expect, it } from 'vitest';

import { getLastActivityDisplay } from './index';

describe('getLastActivityDisplay', () => {
  it('formats an ISO timestamp as "Month D, YYYY"', () => {
    expect(getLastActivityDisplay('2026-07-14T09:23:00.000Z')).toBe('July 14, 2026');
  });

  it('uses the full month name, not an abbreviation', () => {
    expect(getLastActivityDisplay('2026-01-05T00:00:00.000Z')).toBe('January 5, 2026');
  });

  it('returns a placeholder for null (no activity recorded yet)', () => {
    expect(getLastActivityDisplay(null)).toBe('No activity yet');
  });

  it('returns a placeholder for undefined', () => {
    expect(getLastActivityDisplay(undefined)).toBe('No activity yet');
  });

  it('returns a placeholder for an unparsable date string', () => {
    expect(getLastActivityDisplay('not-a-date')).toBe('No activity yet');
  });
});
