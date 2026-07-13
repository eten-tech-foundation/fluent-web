/**
 * Feature-flag types — the fluent-web mirror of the fluent-api contract.
 *
 * The API owns the truth (env-sourced) and publishes a read-only projection at
 * `GET /config/features` (proposal D3/D4). fluent-web never decides policy — it
 * only reflects what the API reports. See
 * `fluent-api/src/lib/features.ts` for the source of these keys.
 *
 * The wire shape is a **named map** so new flags are purely additive: adding a
 * feature later is a new key here + a new `<FeatureGate>`/`useFeatureFlag`
 * usage, with no change to the hook or the gate primitive (D6).
 */

/**
 * Known feature-flag wire keys (camelCase), mirroring the API's `FLAGS`
 * registry. Kept as a string-literal union (not an open `string`) so a typo in
 * `useFeatureFlag('...')` / `<FeatureGate feature="...">` is a compile error and
 * so the diagnostics page can enumerate the known flags.
 */
export type FeatureName = 'repeatedWordCheck';

/** The published feature map: every known flag, always present as a boolean. */
export type Features = Record<FeatureName, boolean>;

/** The `GET /config/features` response envelope. */
export interface FeaturesResponse {
  features: Features;
}

/**
 * The safe, fail-closed default map (D7): every known flag is **off**. Used
 * while flags are loading or when the endpoint errors/is unreachable, so gated
 * AI UI is never surfaced before the API has confirmed the feature is on.
 *
 * Declared as a function (not a shared const) so callers always get a fresh
 * object and can't accidentally mutate a shared default.
 */
export const failClosedFeatures = (): Features => ({
  repeatedWordCheck: false,
});
