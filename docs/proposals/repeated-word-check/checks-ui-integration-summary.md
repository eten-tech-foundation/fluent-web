# Repeated Word Check UI — Review Summary

**Status:** Revised after the first review round (PR #305).

**Purpose:** Reviewer orientation for the proposed Repeated Word Check UI (cards [fluent-web#277](https://github.com/eten-tech-foundation/fluent-web/issues/277) and [fluent-web#278](https://github.com/eten-tech-foundation/fluent-web/issues/278)) plus the small fluent-api persistence additions the cards imply. This summary is intended to stand on its own; the long-form proposal with full analysis lives in the sibling file [`checks-ui-integration-suggestion.md`](checks-ui-integration-suggestion.md) (decisions **W1–W12**, §0–§12; §0 is the change log for this revision). It builds on the approved fluent-api proxy design ([PR #173](https://github.com/eten-tech-foundation/fluent-api/pull/173), decisions **D1–D12**). Ships as **two PRs** — fluent-web (the bulk) plus a small fluent-api PR — and either may land first by design (W8/W12). A **highlight-in-verse** capability requested in review ships as a separate follow-on PR.

## What's being proposed

Give translators the user-facing half of the Repeated Word Check: a **Checks tab** with a notification dot in the drafting page's left panel (#277) and a **Checks panel** listing repeated-word findings per verse, refreshed on every auto-save, with **"Ignore Here" / "Ignore Everywhere"** actions persisted in Fluent's database (#278). The structure (per-check accordion, check-agnostic suppression cascade) anticipates future checks (Wildebeest, spell check) without rework.

## Core decisions for review

1. **Suppression persistence ships as an extension of #172's scope — no new product card** (W1). #172's "backend dependency for all Repeated Word Check UI work" covers it; the fluent-api proposal's D1 deferral was about caching tool results, not user preferences.

2. **Hybrid storage at exactly the scope each rule governs** (W2): "Ignore Here" extends the existing per-`(user, chapterAssignment)` editor-state JSONB (optional Zod keys, **no migration**); "Ignore Everywhere" introduces a new **`user_settings` table** — one row per user, one Zod-typed JSONB column — deliberately establishing Fluent's general user-preference store (future settings become schema keys, not migrations). Findings are filtered **client-side**, keeping the AI proxy the pure pass-through D8/D9 established.

3. **Settings endpoint lives in a new `self` domain** (W7, revised per kaseywright's first-round feedback): `GET/PUT /self/settings`, guarded by `authenticateUser` alone (no `{userId}` in the path, so nothing to misuse and no `requireSelf`/`UserPolicy` middleware), full-replace upsert of one blob, file quartet `domains/self/settings/self-settings.{route,service,repository,types}.ts`. Last-writer-wins concurrency inherited from editor-state and accepted.

4. **Chapter-wide check on every successful verse auto-save** (W3/W4): a TanStack `useQuery` keyed on `(chapterAssignmentId, saveCounter)` sending all drafted verses; `snt_id` = `"{bookCode} {chapter}:{verse}"` (USFM, the smoke-test convention); no extra debounce beyond the existing 2 s save debounce. Drafting mode only (W10).

5. **Three-layer active/inactive cascade, most-specific-non-silent-wins** (W5/W6): Greek Room's `legitimate` verdict → user-global word-pair rule → occurrence rule `(snt_id, repeated_word, ordinal)`; rules are tri-state maps (`absent/'suppress'/'surface'`), which is what makes per-occurrence **undo** of a global rule or machine verdict possible. The dot counts active findings only; ignored items are hidden by default and revealed dimmed (with "Default Ignore"/"Ignore Here"/"Ignore Always" reason labels and "Undo Ignore") under a **"Show Ignored" toggle** (default off, not persisted), matching the revised #278.

6. **Graceful degradation, either-PR-lands-first** (W8/W9): the UI feature-detects `GET /self/settings` (404 ⇒ "Ignore Everywhere" simply not rendered — capability hidden, never a dead control); check failures surface as one inline red line in the panel while the last successful findings stay rendered (TanStack default). No toasts/banners — none exist in this codebase. **"Ignore Everywhere" shows a confirm dialog** (per revised #278) while still being reversible via undo.

## Explicitly out of scope (deferred)

"Drop duplicate" quick-fix and Greek Room feedback loop (excluded by card #278); checks in review/read-only stages; a "Manage ignored words" settings page (the store is shaped for it); async/polling mode; any change to fluent-ai or the proxy contract; sibling checks.

## Resolved in the first review round

- **Zero-state dot** and **language dropdown** mock issues are fixed — chadw corrected the zero-state mock and removed the dropdown from the #278 mocks.
- **Button labels** are now **"Ignore Here" / "Ignore Everywhere"** (joelthe1/Ulf).
- **Ignored items** are revealed dimmed under a **"Show Ignored" toggle** (default off, not persisted) with "Undo Ignore" — the revised #278 added the toggle, largely aligning with our earlier proposal.
- **Settings endpoint** moved to a new **`self` domain** (`GET/PUT /self/settings`, `authenticateUser` only) per kaseywright.

## Areas where input would be most valuable

**Product sign-off (§5.3 / §12 of the proposal):**

1. **"Default Ignore" items.** Greek Room sometimes reports a repeated word but marks it `legitimate: true` — i.e. it detected the repetition but judged it intentional/correct (e.g. a word genuinely repeated for emphasis), so it shouldn't be flagged. We render these as ignored items labeled **"Default Ignore"** (the revised #278 mock's term), still surfaceable per-occurrence in case the checker is wrong. Confirm that "Default Ignore" = "repetition Greek Room found but considers legitimate."
2. Dot mirrored on the panel-toggle button when the left panel is closed, preserving #277's intent.
3. **"Ignore Everywhere" confirm dialog + undo together:** the revised #278 dialog says the action "cannot be undone," but we keep the `[Undo ▾]` reversibility (the dialog guards against accidental clicks; undo handles deliberate reversals). Confirm we may retain undo.
4. **Highlight repeated words in the verse text** (joelthe1/Ulf) ships as a **separate follow-on PR** layered on this one — confirm the sequencing.

**Engineering confirmations:**

1. **W2/W7** — blessing `user_settings` as Fluent's general user-preference store and the new **`self` domain** (`GET/PUT /self/settings`) as its endpoint (this outlives the feature).
2. **W4** — `(snt_id, repeated_word, ordinal)` occurrence identity and NFC-exact (no case folding) key comparison.
3. **W5/W6** — the tri-state cascade and the confirm-dialog-plus-`[Undo ▾]` behavior.
