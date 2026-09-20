import { describe, expect, it } from 'vitest';

import fixtures from '../testing/fixtures/bible-provider-identities.json';

import { bibleKey, parseBibleKey, type Provider } from './providerIdentity';

describe('shared API/web provider identity fixtures', () => {
  it.each(fixtures.valid)('round trips $key', ({ key, provider, externalId }) => {
    expect(parseBibleKey(key)).toEqual({ provider, externalId });
    expect(bibleKey({ provider: provider as Provider, externalId })).toBe(key);
  });
  it.each(fixtures.invalid)('rejects %s', key => expect(parseBibleKey(key)).toBeNull());
});
