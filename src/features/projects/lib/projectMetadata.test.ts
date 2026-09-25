import { describe, expect, it } from 'vitest';

import { buildProjectMetadata } from './projectMetadata';

describe('buildProjectMetadata', () => {
  it('returns empty metadata when no connectivity profile is given', () => {
    expect(buildProjectMetadata()).toEqual({});
  });

  it('includes connectivityProfile when one is given', () => {
    expect(buildProjectMetadata('usually_connected')).toEqual({
      connectivityProfile: 'usually_connected',
    });
  });
});
