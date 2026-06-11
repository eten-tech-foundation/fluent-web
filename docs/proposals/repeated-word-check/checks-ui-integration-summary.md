# Repeated Word Check UI — Review Summary

**Purpose:** Reviewer orientation for the proposed Repeated Word Check UI (cards [fluent-web#277](https://github.com/eten-tech-foundation/fluent-web/issues/277) and [fluent-web#278](https://github.com/eten-tech-foundation/fluent-web/issues/278)) plus the small fluent-api persistence additions the cards imply. This summary is intended to stand on its own; the long-form proposal with full analysis lives in the sibling file [`checks-ui-integration-suggestion.md`](checks-ui-integration-suggestion.md) (decisions **W1–W12**, §1–§12). It builds on the approved fluent-api proxy design ([PR #173](https://github.com/eten-tech-foundation/fluent-api/pull/173), decisions **D1–D12**). Ships as **two PRs** — fluent-web (the bulk) plus a small fluent-api PR — and either may land first by design (W8/W12).

## What's being proposed

Give translators the user-facing half of the Repeated Word Check: a **Checks tab** with a notification dot in the drafting page's left panel (#277) and a **Checks panel** listing repeated-word findings per verse, refreshed on every auto-save, with "Ignore This Time" / "Ignore Always" actions persisted in Fluent's database (#278). The structure (per-check accordion, check-agnostic suppression cascade) anticipates future checks (Wildebeest, spell check) without rework.

## Core decisions for review

1. **Suppression persistence ships as an extension of #172's scope — no new product card** (W1). #172's "backend dependency for all Repeated Word Check UI work" covers it; the fluent-api proposal's D1 deferral was about caching tool results, not user preferences.

2. **Hybrid storage at exactly the scope each rule governs** (W2): "Ignore This Time" extends the existing per-`(user, chapterAssignment)` editor-state JSONB (optional Zod keys, **no migration**); "Ignore Always" introduces a new **`user_settings` table** — one row per user, one Zod-typed JSONB column — deliberately establishing Fluent's general user-preference store (future settings become schema keys, not migrations). Findings are filtered **client-side**, keeping the AI proxy the pure pass-through D8/D9 established.

3. **Settings endpoint mirrors the editor-state idiom one level up** (W7): `GET/PUT /users/settings`, session-implicit user (never in the URL), full-replace upsert of one blob, file quartet `domains/users/settings/user-settings.{route,service,repository,types}.ts`. Last-writer-wins concurrency inherited from editor-state and accepted.

4. **Chapter-wide check on every successful verse auto-save** (W3/W4): a TanStack `useQuery` keyed on `(chapterAssignmentId, saveCounter)` sending all drafted verses; `snt_id` = `"{bookCode} {chapter}:{verse}"` (USFM, the smoke-test convention); no extra debounce beyond the existing 2 s save debounce. Drafting mode only (W10).

5. **Three-layer active/inactive cascade, most-specific-non-silent-wins** (W5/W6): Greek Room's `legitimate` verdict → user-global word-pair rule → occurrence rule `(snt_id, repeated_word, ordinal)`; rules are tri-state maps (`absent/'suppress'/'surface'`), which is what makes per-occurrence **undo** of a global rule or machine verdict possible. The dot counts active findings only; ignored items grey-and-stay with reason labels and an `[Undo ▾]` split button.

6. **Graceful degradation, either-PR-lands-first** (W8/W9): the UI feature-detects `GET /users/settings` (404 ⇒ "Ignore Always" simply not rendered — capability hidden, never a dead control); check failures surface as one inline red line in the panel while the last successful findings stay rendered (TanStack default). No toasts/banners — none exist in this codebase.

## Explicitly out of scope (deferred)

"Drop duplicate" quick-fix and Greek Room feedback loop (excluded by card #278); checks in review/read-only stages; a "Manage ignored words" settings page (the store is shaped for it); async/polling mode; any change to fluent-ai or the proxy contract; sibling checks.

## Areas where input would be most valuable

**Product sign-off (mock/card deviations, §5.2–§5.3 / §12 of the proposal):**

1. Zero-state mock shows the dot but #277's text says no flags ⇒ no dot — we follow the text.
2. The Resources language dropdown appears above the checks content in the #278 mocks with no function there — we propose omitting it.
3. Ignored items **grey-and-stay with undo** instead of the card's "removed from the panel" (dot behavior unchanged; a "Show ignored & OK" toggle gives the card-literal view).
4. Machine-`legitimate` findings shown as inactive items ("Marked OK by Greek Room") — cards are silent on them.
5. Dot mirrored on the panel-toggle button when the left panel is closed, preserving #277's intent.

**Engineering confirmations:**

1. **W2/W7** — blessing `user_settings` as Fluent's general user-preference store and `GET/PUT /users/settings` as its endpoint (this outlives the feature).
2. **W4** — `(snt_id, repeated_word, ordinal)` occurrence identity and NFC-exact (no case folding) key comparison.
3. **W5/W6** — the tri-state cascade and the `[Undo ▾]` split-button behavior.
