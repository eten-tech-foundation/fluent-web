import { describe, expect, it } from 'vitest';

import { buildProjectMetadata } from './projectMetadata';

describe('buildProjectMetadata', () => {
  it('returns an empty object when no profile is selected', () => {
    expect(buildProjectMetadata(null)).toEqual({});
    expect(buildProjectMetadata(undefined)).toEqual({});
  });

  it('embeds the selected profile under connectivityProfile', () => {
    expect(buildProjectMetadata('rarely_connected')).toEqual({
      connectivityProfile: 'rarely_connected',
    });
    expect(buildProjectMetadata('usually_connected')).toEqual({
      connectivityProfile: 'usually_connected',
    });
    expect(buildProjectMetadata('sometimes_connected')).toEqual({
      connectivityProfile: 'sometimes_connected',
    });
  });
});
