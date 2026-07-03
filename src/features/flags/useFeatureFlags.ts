import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

import {
  type FeatureName,
  type Features,
  type FeaturesResponse,
  failClosedFeatures,
} from './flags.types';

/**
 * Query key for the published feature map. Exported so tests and the
 * diagnostics page can reference/invalidate it without restating the string.
 */
export const FEATURE_FLAGS_QUERY_KEY = ['feature-flags'] as const;

/**
 * How long the flag map is considered fresh. Flags change only on deploy/config
 * (never at runtime — proposal D1/D8), so there is no value in refetching them
 * often; a long staleTime avoids a request storm without hiding a real change
 * for longer than a page reload.
 */
const FLAGS_STALE_TIME_MS = 5 * 60 * 1000; // 5 minutes

/** GET the published feature map from fluent-api. Follows the fetch pattern in
 *  `features/bible/hooks/useBibleTarget.ts` (plain fetch + credentials). The
 *  endpoint is unauthenticated (proposal Q1), but we still send credentials for
 *  consistency and so it keeps working if the reviewer decides to gate it. */
export const fetchFeatureFlags = async (): Promise<Features> => {
  const res = await fetch(`${config.api.url}/config/features`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch feature flags (HTTP ${res.status})`);
  }

  const body = (await res.json()) as FeaturesResponse;
  return body.features;
};

export interface UseFeatureFlagsResult {
  /**
   * The effective feature map. **Never undefined** — while loading or on error
   * this is the fail-closed map (every flag `false`), so callers can read
   * `features.repeatedWordCheck` directly without null-checks and get the safe
   * (hidden) answer by default (D7).
   */
  features: Features;
  /** True while the flags are being fetched for the first time. */
  isLoading: boolean;
  /** True if the fetch errored/was unreachable (flags are fail-closed). */
  isError: boolean;
  /** Raw query handle, for a diagnostics page that wants status/refetch. */
  query: UseQueryResult<Features>;
}

/**
 * Fetch and expose the published feature flags (proposal D6/D7).
 *
 * **Fails closed.** The returned `features` map is the fail-closed default
 * (everything off) until the API confirms a flag is on — so gated AI UI stays
 * hidden while the request is in flight or if it fails, which is the whole point
 * (don't surface features whose backend isn't there). The map is always the
 * full `Features` shape, so consumers never branch on undefined.
 */
export const useFeatureFlags = (): UseFeatureFlagsResult => {
  const query = useQuery<Features>({
    queryKey: FEATURE_FLAGS_QUERY_KEY,
    queryFn: async () => {
      try {
        return await fetchFeatureFlags();
      } catch (error) {
        Logger.logException(error instanceof Error ? error : new Error(String(error)), {
          context: 'Feature-flags fetch failed',
        });
        throw error;
      }
    },
    staleTime: FLAGS_STALE_TIME_MS,
    // No retry. The query already fails *closed* — a blip just keeps gated UI
    // hidden (the safe state) and self-corrects on the next natural refetch, so
    // retrying would only delay when `isError` (and the diagnostics banner) can
    // be observed without changing the user-visible outcome. Keeping it off also
    // means the fail-closed answer is available immediately.
    retry: false,
  });

  return {
    // Fail-closed: use live data only once it has actually arrived; otherwise
    // (loading OR error) every flag reads false.
    features: query.data ?? failClosedFeatures(),
    isLoading: query.isLoading,
    isError: query.isError,
    query,
  };
};

/**
 * Thin selector for a single flag (D6). Returns a plain boolean, fail-closed by
 * construction (it reads the fail-closed map from {@link useFeatureFlags}).
 *
 * @example
 *   const checksEnabled = useFeatureFlag('repeatedWordCheck');
 */
export const useFeatureFlag = (name: FeatureName): boolean => {
  const { features } = useFeatureFlags();
  return features[name];
};
