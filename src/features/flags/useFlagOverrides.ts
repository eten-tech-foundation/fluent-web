import { useSyncExternalStore } from 'react';

import {
  clearFlagOverrides,
  type FlagOverrides,
  overrideCount,
  readFlagOverrides,
  setFlagOverride,
  subscribeToFlagOverrides,
} from './flagOverrides';
import { type FeatureName } from './flags.types';

export interface UseFlagOverridesResult {
  /** The flags deliberately forced on this browser (absent key = pass-through). */
  overrides: FlagOverrides;
  /** Force a flag on (`true`), off (`false`), or back to pass-through (`null`). */
  setOverride: (name: FeatureName, value: boolean | null) => void;
  /** Drop every override at once. */
  clearAll: () => void;
  /** Number of active overrides — drives the chip and the diagnostics header. */
  count: number;
}

/**
 * Reactive access to the local feature-flag overrides (see `flagOverrides.ts`
 * for what they are and why they exist).
 *
 * `localStorage` is not reactive, which is why this reads through the module
 * store instead of touching storage directly: writes must notify subscribers or
 * the UI would not update until a page reload. `useSyncExternalStore` requires a
 * `getSnapshot` with stable identity between changes — the store guarantees
 * that, so do not wrap it in anything that rebuilds the object per render.
 *
 * **Do not use this to gate features.** Overrides are merged in exactly one
 * place, `useFeatureFlags`, so that render gating and side-effect gating can
 * never disagree (O3). This hook is for the control surfaces: the `/debug`
 * diagnostics page and the "overrides active" chip.
 */
export const useFlagOverrides = (): UseFlagOverridesResult => {
  const overrides = useSyncExternalStore(
    subscribeToFlagOverrides,
    readFlagOverrides,
    // Server/prerender snapshot: no browser storage exists, so nobody has opted
    // in — the same answer as a fresh browser.
    readFlagOverrides
  );

  return {
    overrides,
    setOverride: setFlagOverride,
    clearAll: clearFlagOverrides,
    count: overrideCount(overrides),
  };
};
