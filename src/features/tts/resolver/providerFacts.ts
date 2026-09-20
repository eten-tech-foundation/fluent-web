import { useMemo } from 'react';

import {
  type QueryClient,
  QueryObserver,
  queryOptions,
  useQueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';

import { config } from '@/lib/config';

import { parseBibleKey } from './providerIdentity';

export const PROVIDER_FACTS_STALE_MS = 60_000;
const factsSchema = z.object({
  bibleKey: z.string(),
  id: z.number().int().nullable(),
  provider: z.enum(['aquifer', 'youversion', 'dbl']),
  externalId: z.string(),
  ttsLicenseStatus: z.enum(['allowed', 'forbidden', 'unknown']),
  licenseNotice: z.string().nullable(),
});
export type ProviderFacts = z.infer<typeof factsSchema>;
export type ProviderFactsState =
  | { state: 'ready'; facts: ProviderFacts }
  | { state: 'loading' | 'error' | 'missing' };

export const providerFactsOptions = (projectId: number, key: string) =>
  queryOptions({
    queryKey: ['bible-provider-facts', projectId, key],
    queryFn: async ({ signal }): Promise<ProviderFacts> => {
      if (!parseBibleKey(key)) throw new Error('Invalid provider identity');
      const response = await fetch(
        `${config.api.url}/projects/${projectId}/bible-resources/${encodeURIComponent(key)}`,
        {
          credentials: 'include',
          signal,
        }
      );
      if (!response.ok) throw new Error(`Could not read Bible resource (${response.status})`);
      const facts = factsSchema.parse(await response.json());
      if (facts.bibleKey !== key) throw new Error('Mismatched provider identity');
      return facts;
    },
    staleTime: PROVIDER_FACTS_STALE_MS,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });

/** A shared authority for both text clearance and actual recording notices. Never reads media. */
export class ProviderFactsAccess {
  constructor(
    readonly client: QueryClient,
    readonly projectId: number
  ) {}

  read(key: string | null, waitForRefresh = false): ProviderFactsState {
    if (!key) return { state: 'missing' };
    const state = this.client.getQueryState<ProviderFacts>(
      providerFactsOptions(this.projectId, key).queryKey
    );
    if (state?.status === 'error') return { state: 'error' };
    if (
      (waitForRefresh && state?.fetchStatus === 'fetching') ||
      !state?.data ||
      state.isInvalidated ||
      Date.now() - state.dataUpdatedAt >= PROVIDER_FACTS_STALE_MS
    )
      return { state: 'loading' };
    return { state: 'ready', facts: state.data };
  }

  observedStatus(key: string | null): ProviderFacts['ttsLicenseStatus'] {
    if (!key) return 'unknown';
    const state = this.client.getQueryState<ProviderFacts>(
      providerFactsOptions(this.projectId, key).queryKey
    );
    return state?.status === 'success' ? (state.data?.ttsLicenseStatus ?? 'unknown') : 'unknown';
  }

  status(key: string | null): ProviderFacts['ttsLicenseStatus'] {
    const result = this.read(key);
    return result.state === 'ready' ? result.facts.ttsLicenseStatus : 'unknown';
  }

  async ensure(key: string | null): Promise<void> {
    if (!key) return;
    try {
      await this.client.fetchQuery(providerFactsOptions(this.projectId, key));
    } catch {
      /* Explicit error state is retained in the query cache; recordings remain usable. */
    }
  }

  observe(key: string, listener: () => void): () => void {
    const observer = new QueryObserver(this.client, providerFactsOptions(this.projectId, key));
    return observer.subscribe(listener);
  }

  subscribe = (listener: () => void) =>
    this.client.getQueryCache().subscribe(event => {
      const key = event.query.queryKey;
      if (key[0] === 'bible-provider-facts' && key[1] === this.projectId) listener();
    });
}

export function useProviderFacts(projectId: number) {
  const client = useQueryClient();
  return useMemo(() => new ProviderFactsAccess(client, projectId), [client, projectId]);
}
