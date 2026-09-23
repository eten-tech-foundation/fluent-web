import { describe, expect, it } from 'vitest';

import { buildProjectMetadata } from './projectMetadata';

describe('buildProjectMetadata', () => {
  it('returns empty metadata', () => {
    expect(buildProjectMetadata()).toEqual({});
  });
});
