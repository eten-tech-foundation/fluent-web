import { describe, expect, it } from 'vitest';

import { CONNECTIVITY_PROFILE_OPTIONS } from './connectivityProfiles';

describe('CONNECTIVITY_PROFILE_OPTIONS', () => {
  it('lists the three profiles in the order required by issue #280', () => {
    expect(CONNECTIVITY_PROFILE_OPTIONS.map(option => option.value)).toEqual([
      'usually_connected',
      'sometimes_connected',
      'rarely_connected',
    ]);
  });

  it('pairs each profile with a label and description i18n key', () => {
    for (const option of CONNECTIVITY_PROFILE_OPTIONS) {
      expect(option.labelKey).toBeTruthy();
      expect(option.descKey).toBeTruthy();
    }
  });
});
