import { type ReactNode } from 'react';

import { type FeatureName } from './flags.types';
import { useFeatureFlag } from './useFeatureFlags';

export interface FeatureGateProps {
  /** The flag that must be on for the children to render. */
  feature: FeatureName;
  /** Rendered only when the named flag is on. */
  children: ReactNode;
  /**
   * Optional fallback rendered when the flag is off (including while loading or
   * on error — the gate is fail-closed, D7). Defaults to nothing, i.e. the
   * gated UI simply disappears as though it were not implemented.
   */
  fallback?: ReactNode;
}

/**
 * Render children only when a feature flag is on (proposal D6/D7).
 *
 * **Fails closed:** while the flag map is loading, or if the endpoint errors,
 * the flag reads `false` (see {@link useFeatureFlag}), so the children are
 * hidden and the optional `fallback` (default: nothing) is shown instead. This
 * is a pure render-wrapper — it does not gate side effects such as network
 * queries; a caller that also needs to suppress a query should read the flag
 * directly and fold it into that query's `enabled`.
 */
export const FeatureGate: React.FC<FeatureGateProps> = ({ feature, children, fallback = null }) => {
  const enabled = useFeatureFlag(feature);
  return <>{enabled ? children : fallback}</>;
};

export default FeatureGate;
