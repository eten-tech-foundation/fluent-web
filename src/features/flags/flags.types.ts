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
 *
 * ── ⚠️ KNOWN, DELIBERATE GAP: `aiSuggestions` is missing here ───────────────
 * fluent-api publishes THREE flags (`repeatedWordCheck`, `aiSuggestions`,
 * `sourceAudio` once its Phase-04 change lands); this union lists only two. The
 * omission is real, not an oversight of the API contract:
 *
 *   • `EN_FEATURE_AI_SUGGESTIONS` → wire key `aiSuggestions` exists in
 *     `fluent-api/src/lib/features.ts` (same `aiIsWired` derived default as
 *     `repeatedWordCheck`), but **nothing in fluent-web reads it**. The
 *     AI-suggestion UI is gated by its own `isAiActive` / `isAiThresholdMet`
 *     props threaded through `DraftingUI`, not by `useFeatureFlag`.
 *   • Both directions are safe today: unknown API keys are ignored (the hook
 *     reads by key), and a missing key would fail closed. So this is a
 *     documentation/parity gap, not a bug — do not "fix" it by adding the key
 *     unless something actually gates on it, since an unread flag on the
 *     diagnostics page is a lie about what the app honours.
 *
 * **If you are here resolving a merge conflict:** whoever wires the
 * AI-suggestions UI to its flag will add `aiSuggestions` to this union and to
 * `failClosedFeatures()` below. That is the intended resolution — keep their
 * key AND `sourceAudio`; the union is additive and the two changes do not
 * conflict semantically even when git says they do. Delete this whole comment
 * block once `aiSuggestions` is present and actually gating something.
 * *(gap found 2026-08-06 while implementing source-TTS.)*
 */
export type FeatureName = 'repeatedWordCheck' | 'sourceAudio';

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
  // NOTE: no `aiSuggestions` key here on purpose — see the KNOWN GAP note on
  // `FeatureName` above. This is the second of the two places a merge conflict
  // will land when that flag is finally wired up; the resolution is additive.
  repeatedWordCheck: false,
  // Source Audio — recorded OR synthesized (source-tts proposal T12/§6.3).
  // The name reflects that one gate covers both provenances.
  // Off by default like every flag here: the controls must not appear before the
  // API confirms the feature.
  sourceAudio: false,
});
