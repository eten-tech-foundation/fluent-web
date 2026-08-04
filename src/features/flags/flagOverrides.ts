/**
 * Local feature-flag overrides — a developer/QA affordance, not product config.
 *
 * Why this exists: a feature can be merged and deployed while its API flag is
 * still off (ship dark), and it must still be exercisable **in the real hosting
 * environment** before the flag is turned on for real. The source-TTS proposal
 * (`docs/proposals/source-tts/source-tts-suggestion.md` §6.3 / T12 and §11.3
 * step 4) explicitly relies on such an override existing.
 *
 * Shape of the mechanism (decisions O1–O6 of the phase plan):
 *   - **O1** Per-flag tri-state: force on / force off / pass through. There is
 *     deliberately **no `'default'` sentinel value** — pass-through is encoded
 *     as the flag key simply being *absent* from the stored map. Absence is the
 *     natural encoding, it keeps the merge in `useFeatureFlags` a plain spread,
 *     and it means a cleared override leaves no residue behind.
 *   - **O2** Storage is `localStorage` only: one JSON object under one key. No
 *     cookies (this must not drag consent-banner questions into a debug tool)
 *     and **nothing on the wire** — no header, query param, or API field ever
 *     carries an override, so the backend cannot even tell. That stays honest
 *     because the API *publishes* flags and does not enforce them (feature-flags
 *     proposal D5); forcing a flag on grants no access the user did not have.
 *   - **O5** Active in **every** environment, production included. Do not gate
 *     any of this on `import.meta.env.DEV` — testing in the natural hosting is
 *     the entire point. It is protected by being unlinked + login-gated, and by
 *     the backend still enforcing auth and permissions on any real attempt.
 *   - **O6** No expiry. The always-visible chip (`FlagOverrideChip`) is the
 *     safeguard against forgetting an override is on.
 *
 * Invariants for anyone editing this file:
 *   - **Never throw.** Every `localStorage`/JSON path degrades to "no
 *     overrides". A debug affordance must not be able to white-screen the app.
 *   - **One read site.** Only `useFeatureFlags` may consult overrides; a second
 *     read site is how render gating and side-effect gating drift apart (O3).
 */

import { type FeatureName, type Features, failClosedFeatures } from './flags.types';

/**
 * Map of deliberate local overrides. A key is present only when the user has
 * forced that flag; the boolean is the forced value (O1).
 */
export type FlagOverrides = Partial<Record<FeatureName, boolean>>;

/** The single `localStorage` key holding the serialized {@link FlagOverrides}. */
export const FLAG_OVERRIDES_STORAGE_KEY = 'fluent.flagOverrides';

/** Frozen empty map, so "no overrides" is a stable identity for React. */
const NO_OVERRIDES: FlagOverrides = Object.freeze({});

/** Known flag keys, derived from the fail-closed map so a new flag needs no edit here. */
const knownFeatureNames = (): string[] => Object.keys(failClosedFeatures());

const isFeatureName = (key: string): key is FeatureName => knownFeatureNames().includes(key);

/**
 * Read raw storage, tolerating every failure mode. The try/catch covers both a
 * throwing `localStorage` (Safari private mode, storage disabled by policy) and
 * a `localStorage` that does not exist at all (non-browser/prerender), since
 * touching a missing global throws too.
 */
const readRaw = (): string | null => {
  try {
    return globalThis.localStorage.getItem(FLAG_OVERRIDES_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeRaw = (value: string | null): void => {
  try {
    if (value === null) {
      globalThis.localStorage.removeItem(FLAG_OVERRIDES_STORAGE_KEY);
    } else {
      globalThis.localStorage.setItem(FLAG_OVERRIDES_STORAGE_KEY, value);
    }
  } catch {
    // Storage unavailable (Safari private mode, quota, disabled): the override
    // simply does not persist. Nothing else in the app may be affected.
  }
};

/**
 * Parse + **sanitize** whatever is in storage into a trustworthy map.
 *
 * Anything unexpected is dropped rather than propagated: unknown keys (a flag
 * that was renamed or removed), non-boolean values, non-object JSON, corrupt
 * JSON, or storage being unreadable all collapse to "no overrides".
 */
const parseOverrides = (): FlagOverrides => {
  const raw = readRaw();
  if (raw === null) return NO_OVERRIDES;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NO_OVERRIDES;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return NO_OVERRIDES;
  }

  const sanitized: FlagOverrides = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'boolean' && isFeatureName(key)) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length === 0 ? NO_OVERRIDES : sanitized;
};

const sameOverrides = (a: FlagOverrides, b: FlagOverrides): boolean => {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(key => a[key as FeatureName] === b[key as FeatureName]);
};

// --- module store -----------------------------------------------------------
// `localStorage` is not reactive, so every write goes through this store. The
// parsed snapshot is cached in a module variable and its **identity is kept
// stable until the value actually changes**, because `useSyncExternalStore`
// re-reads `getSnapshot` on every render and would loop forever if it were
// handed a fresh object each time.

let snapshot: FlagOverrides | null = null;
const listeners = new Set<() => void>();

/** Current overrides. Stable object identity until a real change occurs. */
export const readFlagOverrides = (): FlagOverrides => {
  snapshot ??= parseOverrides();
  return snapshot;
};

/**
 * Re-read storage and notify subscribers if the value changed. Called by the
 * cross-tab `storage` listener, and useful in tests that poke `localStorage`
 * directly instead of going through {@link setFlagOverride}.
 */
export const refreshFlagOverrides = (): void => {
  const next = parseOverrides();
  const current = readFlagOverrides();
  if (sameOverrides(current, next)) return;
  snapshot = next;
  for (const listener of listeners) listener();
};

/** Subscribe to override changes (the `useSyncExternalStore` contract). */
export const subscribeToFlagOverrides = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const persist = (next: FlagOverrides): void => {
  // Writing an empty map removes the key entirely, so "no overrides" leaves no
  // residue in storage (and a future reader sees exactly the same state as a
  // browser that never had an override).
  writeRaw(Object.keys(next).length === 0 ? null : JSON.stringify(next));
  refreshFlagOverrides();
};

/**
 * Force `name` on (`true`), off (`false`), or back to pass-through (`null`).
 * Pass-through deletes the key rather than storing a sentinel (O1).
 */
export const setFlagOverride = (name: FeatureName, value: boolean | null): void => {
  const next: FlagOverrides = { ...readFlagOverrides() };
  if (value === null) {
    delete next[name];
  } else {
    next[name] = value;
  }
  persist(next);
};

/** Clear every override — the chip's ✕ action and the diagnostics "Reset all" (O7). */
export const clearFlagOverrides = (): void => {
  persist({});
};

/** How many flags are currently overridden (chip count + diagnostics header). */
export const overrideCount = (overrides: FlagOverrides): number => Object.keys(overrides).length;

/**
 * Apply overrides to a published map. Kept here (next to the storage rules)
 * rather than inline in the hook so the merge order is documented in one place:
 * fail-closed defaults, then what the API published, then the local override.
 */
export const applyFlagOverrides = (published: Features, overrides: FlagOverrides): Features => ({
  ...published,
  ...overrides,
});

// Cross-tab propagation: a change made on `/debug` in one tab should be visible
// in the tab under test. `storage` only fires in *other* tabs, so same-tab
// updates rely on `persist()` above.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === null || event.key === FLAG_OVERRIDES_STORAGE_KEY) {
      refreshFlagOverrides();
    }
  });
}
