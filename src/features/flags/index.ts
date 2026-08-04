/**
 * Feature flags — the fluent-web consumer of fluent-api's published feature map
 * (`GET /config/features`). See the proposal at
 * `fluent-api/docs/proposals/feature-flags/feature-flags-suggestion.md`.
 *
 * Public surface:
 *   - `useFeatureFlags()` — the full, fail-closed feature map + query status.
 *   - `useFeatureFlag(name)` — a single boolean (fail-closed).
 *   - `<FeatureGate feature=...>` — render children only when a flag is on.
 *   - types: `FeatureName`, `Features`, `FeaturesResponse`.
 *
 * Local overrides (a developer/QA affordance for exercising a dark-shipped
 * feature — see `flagOverrides.ts`):
 *   - `useFlagOverrides()` + the storage helpers — for the `/debug` controls.
 *   - `<FlagOverrideChip />` — the app-wide "overrides active" reminder.
 * Overrides are applied inside `useFeatureFlags` only; never gate a feature on
 * them directly.
 */
export { FeatureGate, type FeatureGateProps } from './FeatureGate';
export { FeatureFlagsDiagnostics } from './FeatureFlagsDiagnostics';
export { FlagOverrideChip } from './FlagOverrideChip';
export { useFlagOverrides, type UseFlagOverridesResult } from './useFlagOverrides';
export {
  readFlagOverrides,
  setFlagOverride,
  clearFlagOverrides,
  refreshFlagOverrides,
  subscribeToFlagOverrides,
  overrideCount,
  applyFlagOverrides,
  FLAG_OVERRIDES_STORAGE_KEY,
  type FlagOverrides,
} from './flagOverrides';
export {
  useFeatureFlags,
  useFeatureFlag,
  fetchFeatureFlags,
  FEATURE_FLAGS_QUERY_KEY,
  type UseFeatureFlagsResult,
} from './useFeatureFlags';
export {
  type FeatureName,
  type Features,
  type FeaturesResponse,
  failClosedFeatures,
} from './flags.types';
