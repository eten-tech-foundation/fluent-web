import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';

import { fetchAllLanguages } from './useAquiferResources';

describe('useAquiferResources', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('routes fetchAllLanguages through fluent-api with credentials', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 1, code: 'eng', englishDisplay: 'English' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await fetchAllLanguages();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(`${config.api.url}/aquifer/languages`);
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
    });
    expect((init?.headers as Record<string, string> | undefined)?.['api-key']).toBeUndefined();
  });
});
