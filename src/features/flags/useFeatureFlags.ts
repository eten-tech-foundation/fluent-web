import { useMemo } from 'react';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

import { applyFlagOverrides, type FlagOverrides } from './flagOverrides';
import {
  type FeatureName,
  type Features,
  type FeaturesResponse,
  failClosedFeatures,
} from './flags.types';
import { useFlagOverrides } from './useFlagOverrides';

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
 *  endpoint is login-gated (proposal Q1, reviewer-confirmed 2026-07-07), so
 *  `credentials: 'include'` sends the session cookie; a not-yet-authenticated
 *  request gets a 401, which throws below → the query fails closed (every flag
 *  off) until the session + flags resolve, keeping gated UI hidden. */
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

  // The body is cast, not schema-validated, so a 200 with a malformed/partial
  // `features` object (missing a known key, or `features` absent entirely) must
  // NOT be trusted verbatim — that would let an unknown flag read `undefined`
  // (falsy, but off-contract) and bypass the fail-closed guarantee. Spread the
  // known-off defaults FIRST, then overlay whatever the API sent: every known
  // flag is present as a boolean, and only keys the API explicitly reports as
  // `true` turn on (W3, D7).
  const body = (await res.json()) as FeaturesResponse;
  return { ...failClosedFeatures(), ...body.features };
};

export interface UseFeatureFlagsResult {
  /**
   * The **effective** feature map — what the app should actually behave like.
   * **Never undefined**: while loading or on error this starts from the
   * fail-closed map (every flag `false`), so callers can read
   * `features.repeatedWordCheck` directly without null-checks and get the safe
   * (hidden) answer by default (D7).
   *
   * Note this may be a **local lie**: any flag the user has deliberately forced
   * on this browser (see `flagOverrides.ts`) is reflected here. Use
   * {@link UseFeatureFlagsResult.published} when you need what the API said.
   */
  features: Features;
  /**
   * What the API published (fail-closed defaults ∪ response body), **without**
   * local overrides applied. For the diagnostics page's "Published" column.
   */
  published: Features;
  /** The local overrides that were applied, if any (absent key = pass-through). */
  overrides: FlagOverrides;
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
 *
 * **This is the one and only place local overrides are applied** (O3). Every
 * consumer — `useFeatureFlag`, `<FeatureGate>`, and query-`enabled` gating such
 * as `DraftingUI`'s checks query — reads through this hook, so merging here
 * covers render *and* side effects with a single rule and they cannot drift.
 *
 * Fail-closed is **not weakened** by this: it still holds for everyone who has
 * not deliberately opted in on that specific browser. An override is a local,
 * explicit, self-inflicted act stored only in `localStorage`; nothing is sent to
 * the API, and the backend remains the real authority (feature-flags D5 — it
 * publishes flags, it does not enforce them), so forcing a flag on grants no
 * access the user did not already have. It is intentionally live in production
 * builds (O5) — testing a dark-shipped feature in its real hosting environment
 * is the reason it exists, so do not gate the merge on `import.meta.env.DEV`.
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

  const { overrides } = useFlagOverrides();

  // Fail-closed: use live data only once it has actually arrived; otherwise
  // (loading OR error) every flag reads false.
  const published = useMemo(() => query.data ?? failClosedFeatures(), [query.data]);

  // Overrides land LAST, on purpose: a force-on has to work even while the fetch
  // is failing or unauthenticated (O4), which is exactly when you want to demo a
  // dark-shipped feature. Memoized so `features` keeps a stable identity across
  // renders for consumers that use it as an effect/query dependency.
  const features = useMemo(() => applyFlagOverrides(published, overrides), [published, overrides]);

  return {
    features,
    published,
    overrides,
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
