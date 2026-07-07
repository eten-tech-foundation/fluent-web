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
 */
export { FeatureGate, type FeatureGateProps } from './FeatureGate';
export { FeatureFlagsDiagnostics } from './FeatureFlagsDiagnostics';
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
