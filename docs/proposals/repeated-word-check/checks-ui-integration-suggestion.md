# Repeated Word Check UI — Proposal (Checks Tab, Checks Panel, and Suppression Persistence)

**Status:** Draft for review.
**Reviewer shortcut:** a condensed, stands-on-its-own review summary lives in [`checks-ui-integration-summary.md`](checks-ui-integration-summary.md).
**Scope:** Implements the user-facing half of the Repeated Word Check feature: the **Checks tab** (#277) and **Checks view panel** (#278) on fluent-web, plus the small fluent-api additions both cards imply (suppression persistence). This is a single proposal covering both repos so reviewers see the whole design in one place; **implementation will ship as two PRs** (one per repo), and either may land first (§9.4).

**Related cards:**

- [fluent-api#172 — Build Repeated Word Check Service](https://github.com/eten-tech-foundation/fluent-api/issues/172) — the backend proxy endpoint (implemented; see companion docs below).
- [fluent-web#277 — Build Checks Tab](https://github.com/eten-tech-foundation/fluent-web/issues/277) — tab + notification dot.
- [fluent-web#278 — Build Checks View Panel](https://github.com/eten-tech-foundation/fluent-web/issues/278) — panel content + ignore actions.

**Companion documents (fluent-api repo):**

- [`ai-tools-integration-suggestion.md`](https://github.com/eten-tech-foundation/fluent-api/blob/main/docs/proposals/repeated-word-check/ai-tools-integration-suggestion.md) — the approved contract & design for `POST /ai/tools/greek-room/repeated-words` (decisions **D1–D12** referenced throughout this document).
- [`ai-tools-integration-operations.md`](https://github.com/eten-tech-foundation/fluent-api/blob/main/docs/proposals/repeated-word-check/ai-tools-integration-operations.md) — operations, env wiring, testing strategy for the proxy.
- [`ai-tools-integration-status.md`](https://github.com/eten-tech-foundation/fluent-api/blob/main/docs/proposals/repeated-word-check/ai-tools-integration-status.md) — implementation status of the proxy.

This document's own decisions are numbered **W1–W12** (W = web) to avoid collision with the fluent-api proposal's D-series.

---

## 1. Background

fluent-api now exposes Greek Room's _Repeated Words_ check at `POST /ai/tools/greek-room/repeated-words` (card #172). The endpoint is a thin authenticated proxy to fluent-ai: it accepts a chapter's verses and returns a `ToolJobResponse[RepeatedWordsResult]` envelope whose `findings[]` identify consecutive repeated words (`{snt_id, repeated_word, surf, start_position, legitimate, severity}`).

Cards #277 and #278 define how translators consume those findings in the drafting view:

- **#277:** a **Checks tab** is added to the drafting page's left panel alongside the existing Resources tab, with a **notification dot** on the tab header whenever the current chapter has one or more active flags. The dot is absent at zero flags and clears silently on the next auto-save once all flagged issues are resolved.
- **#278:** the **Checks panel** lists all repeated-word flags for the current chapter, grouped by verse, each with enough context to locate it, refreshed on every auto-save, with two actions per flagged occurrence: **"Ignore This Time"** (user-level, this occurrence) and **"Ignore Always"** (user-level, this word pair, across all the user's projects) — both "stored in Fluent's database." A "No issues found" zero state is shown when the chapter is clean.

Both cards carry mockups (drafting page, Judges 4, Gujarati IRV); §5 transcribes them and flags two mock/text inconsistencies for product sign-off.

### 1.1 What the cards imply beyond fluent-web

The ignore actions require server-side persistence that does not exist yet. #172's text ("the backend dependency for all Repeated Word Check UI work") is broad enough to cover suppression storage — the fluent-api proposal's **D1** deferred caching of _tool runs/findings_, which is a different concern from user suppression preferences (a requirement that did not exist until #277/#278 were authored). Accordingly, suppression persistence ships as an **extension of #172's scope** (decision **W1**), designed here and implemented in the fluent-api PR of this pair, which also amends the approved fluent-api proposal pair (the suggestion + operations docs) to record the scope extension. No new product card is needed.

### 1.2 Repos touched

| Repo | Touched | What changes |
| --- | --- | --- |
| **fluent-web** | yes (bulk) | Left-panel tab container, Checks panel feature, check-trigger hook, suppression cascade, editor-state keys. |
| **fluent-api** | yes (small) | New `user_settings` table + `GET/PUT /users/settings`; Zod-schema extension of the editor-state `resources` blob (no migration). |
| **fluent-ai** | no | The check itself is unchanged. |
| **fluent-platform** | no | No new services or env vars. |

---

## 2. Scope

**In scope (this proposal / the two implementation PRs):**

1. A tabbed left-panel header — **Resources | Checks** — replacing the current "Resources" heading in the drafting page's left panel, per the #277 mock (§5.1).
2. The **Checks panel** (#278): per-check accordion ("Repeated Words" first), verse-grouped occurrence snippets, ignore actions, zero state.
3. The **notification dot** (#277) on the Checks tab header, plus one proposed deviation: mirroring the dot on the panel-toggle button when the panel is closed (§5.3, sign-off item).
4. A chapter-wide **check trigger** fired on every successful verse auto-save (W3).
5. A three-layer **active/inactive cascade** unifying Greek Room's `legitimate` verdicts with user ignores, including undo (W5, W6).
6. **Persistence:** occurrence-level rules in the existing editor-state JSONB; global word-pair rules in a new `user_settings` table exposed at `GET/PUT /users/settings` (W2, W7).
7. **Graceful degradation** when the settings backend half is absent, and inline error surfacing when the check call fails (W8, W9).
8. Tests on both sides using each repo's established test infrastructure (§10).

**Explicitly out of scope (v1):**

- "Drop duplicate" one-click fix (excluded by card #278).
- Surfacing "Ignore Always" suppressions to the Greek Room team as feedback (excluded by card #278).
- Running checks in the read-only `/view` route or in review stages (W10; noted as future work §11).
- A "Manage ignored words" settings page (future work; the `user_settings` storage deliberately makes room for it, §11).
- Any change to the fluent-ai service or the fluent-api proxy endpoint contract.
- Async/polling mode for the check (the proxy returns `status: "completed"` synchronously today; the hook consumes the envelope so polling can be added later without reshaping the UI, per D3/D9).
- Checks other than Repeated Words (the accordion structure anticipates them; none are wired).

---

## 3. Decisions summary

Restated conclusions; supporting analysis in the cited sections.

| # | Decision | Short rationale |
| --- | --- | --- |
| **W1** | Suppression persistence ships as an extension of #172's scope; no new product card. | #172's wording covers backend dependencies of the UI work; D1's deferral was about caching tool results, not user preferences. See §1.1. |
| **W2** | Hybrid storage: "Ignore This Time" lives in the existing per-chapter editor-state JSONB (schema-key addition, no migration); "Ignore Always" lives in a new `user_settings` table (one row per user, single Zod-typed JSONB column). Findings are filtered **client-side**. | Each rule is stored at exactly the scope it governs. Client-side filtering keeps the AI proxy a pure pass-through (D8/D9). `user_settings` deliberately establishes Fluent's user-global preference store: future settings become schema extensions, not migrations. See §7. |
| **W3** | Chapter-wide check on every successful verse save: a TanStack `useQuery` keyed on `(chapterAssignmentId, saveCounter)`, where `saveCounter` increments in the verse-save mutation's `onSuccess`. The request sends **all currently drafted verses** of the chapter. No extra coalescing debounce. | The dot needs chapter-wide awareness; per-verse merging is more code for no user-visible gain. The existing 2 s per-verse save debounce already rate-limits; the check is <1 s. KISS — optimize if heavier checks arrive. See §6.2. |
| **W4** | `snt_id` = `"{bookCode} {chapter}:{verse}"` (USFM book code, e.g. `JDG 4:3`), matching the convention already used by the repo smoke tests. Occurrence identity for suppressions = `(snt_id, repeated_word, ordinal)` where ordinal is the index of the finding among same-`repeated_word` findings in the verse, ordered by `start_position`. | Ordinals survive unrelated edits (positions don't); adding/removing an earlier same-pair occurrence conservatively re-flags, the safe failure direction. We count Greek Room's findings, never tokenize text ourselves, so Greek Room's equivalence policy is inherited consistently. See §6.3. |
| **W5** | Every finding resolves to **active/inactive** via a three-layer cascade — Greek Room verdict (`legitimate`), user-global word-pair rule, occurrence rule — where the **most specific non-silent verdict wins**. Rules are tri-state maps (`absent / 'suppress' / 'surface'`). The dot counts active findings only. Inactive findings render greyed with a reason label; a "Show ignored & OK" toggle (default ON, persisted) hides them. | One mechanism explains machine-legitimate and user-ignored alike ("pre-ignored by Greek Room"). Specificity, not temporal order, keeps resolution deterministic. Greyed-not-removed keeps undo discoverable. See §6.4. |
| **W6** | Active findings show `[Ignore This Time] [Ignore Always]` (per card). Inactive findings show one `[Undo ▾]` split button: default click acts at the occurrence layer (delete own rule, or write an occurrence `surface` override); the chevron menu offers explicit global actions with consequence-naming labels. Any global write first purges the user's occurrence rules for that pair **in the current chapter's editor state only**. No confirmation dialogs (global rules are reversible). | Default click never silently edits global state. Purge-local prevents the just-clicked panel from appearing to ignore the action (occurrence beats global in the cascade); other chapters' specific pronouncements deliberately stand. See §6.5. |
| **W7** | Settings endpoint mirrors the editor-state idiom one level up: **`GET /users/settings` + `PUT /users/settings`**, session-implicit user (no user in URL), full-replace upsert of one Zod-typed JSONB blob. File quartet `domains/users/settings/user-settings.{route,service,repository,types}.ts`. | `user_settings` is to _user_ what `user_chapter_assignment_editor_state` is to _(user, chapter)_; same shape, same endpoint idiom, same review story ("we did what you already do"). Last-writer-wins on concurrent tabs is inherited from editor-state and accepted. See §8. |
| **W8** | Graceful degradation by feature detection: if `GET /users/settings` 404s, the session records `globalIgnoresAvailable = false` and the `[Ignore Always]` button plus global menu entries are **not rendered** (capability hidden, never a dead control). Unknown/absent JSONB keys parse as empty on both sides. Either repo's PR can land first. | The UI must not assume the backend half exists. An invisible capability is honest; a dead button is a bug report. See §9. |
| **W9** | Check-call failure surfaces as a single inline `text-sm text-red-500` line at the top of the Checks panel ("Checks failed to refresh"); the panel keeps rendering the last successful findings (TanStack keeps `query.data` on refetch failure) and the dot reflects that last-known state. Failures log via the existing `Logger`. No toast/banner/popup. | Matches the drafting page's own inline-status precedent ("Auto-save failed"). Failure mode degrades to "results are one save behind." See §9.2. |
| **W10** | The check runs in drafting mode only — not in the read-only `/view` route — and is skipped (`enabled: false`) when no verse has content and while the settings feature-detection probe (§9.1) is unresolved. | Card scope is the drafting view; empty chapters have nothing to check; the probe is one fast `GET`, and waiting for it means the first findings render is already cascade-correct. Review-stage checks are future work. See §6.2. |
| **W11** | Left-panel architecture follows the mocks: a text-tab header row ("Resources \| Checks", blue underline active state, blue dot after "Checks"), dot visible from either tab; Checks content = per-check accordion sections with verse-grouped snippets and the two buttons; zero state inside the accordion. Proposed deviation for sign-off: when the whole panel is closed, the dot is mirrored on the panel-toggle button. | Mock-faithful where the mocks speak; the toggle-button dot preserves #277's intent (translator is notified) when the panel is hidden. See §5. |
| **W12** | One proposal document (this file) covering both repos; two implementation PRs (fluent-web, fluent-api), cross-referencing each other and the cards. | Splitting the proposal doubles reviewer overhead for a design whose halves only make sense together. See §9.4. |

---

## 4. End-to-end picture

```mermaid
sequenceDiagram
  participant T as Translator
  participant D as DraftingPage (fluent-web)
  participant H as useRepeatedWordsCheck (TanStack)
  participant A as fluent-api
  participant I as fluent-ai

  T->>D: types in verse textarea
  D->>D: 2s debounce (useBibleTextDebounce)
  D->>A: POST /translated-verses (auto-save)
  A-->>D: 200 (verse saved)
  D->>H: saveCounter++ (mutation onSuccess)
  H->>A: POST /ai/tools/greek-room/repeated-words<br/>{lang_code, ..., verses: ALL drafted verses}
  A->>I: forwarded verbatim (X-API-Key)
  I-->>A: ToolJobResponse {status: completed, result: {findings}}
  A-->>H: envelope passthrough
  H->>H: cascade-resolve findings vs.<br/>occurrence rules (editor state) +<br/>global rules (user settings)
  H-->>D: {activeFindings, inactiveFindings}
  D-->>T: dot on Checks tab (active > 0),<br/>panel groups by verse
```

The response envelope is consumed whole (D9): the hook inspects `status` and `result`, so a future slow tool that returns `status: "queued"` can add polling without changing the UI contract.

## 5. UI design

### 5.1 What the mocks show

The cards' mockups (drafting page, Judges 4, Gujarati IRV project) define the visual target:

- **Tab header (#277 mock):** the left panel's current `Resources` heading is replaced by a text-tab row — **"Resources | Checks"** — active tab in blue with a blue underline, inactive tab plain. The **notification dot is a solid blue filled circle immediately right of the "Checks" label**, and the mock shows it while the *Resources* tab is active: the dot is visible from either tab whenever the panel is open.
- **Checks content (#278 mocks):** below the tab header, a card containing a **collapsible "Repeated Words" accordion section** (expanded by default). The accordion-per-check structure anticipates future sibling checks (the board already holds draft cards for Greek Room Wildebeest and Spell checks) without UI rework. Inside the section, findings are grouped by verse:
  - bold **"Verse N"** heading per verse that has findings (verses without findings get no group);
  - one row per occurrence: a one-line context snippet showing the repeated pair in situ;
  - two solid-blue buttons side by side beneath each snippet: `[Ignore This Time] [Ignore Always]`;
  - a horizontal separator between verse groups.
- **Zero state (#278 mock):** the "Repeated Words" section shows a centered bold **"No issues found"**.

### 5.2 Mock/text inconsistencies — for product sign-off

1. **Dot in the zero state.** The #278 zero-state mock still shows the dot on the Checks tab, contradicting #277's text ("the dot is absent when there are no active flags — no zero state"). **We follow the text:** no flags, no dot. Confirm.
2. **Language dropdown above the Checks panel.** Both #278 mocks show the Resources tab's "English" language dropdown above the checks content, with no defined function for checks (the check runs against the chapter's target language; there is nothing to select). We presume this is a carryover artifact of editing a Resources-tab screenshot and **propose omitting the dropdown from the Checks tab**. Confirm.

### 5.3 Deviations from the card text — for product sign-off

1. **Ignored items grey-and-stay rather than disappear.** #278 says an ignored occurrence "is removed from the panel." We instead render it greyed/subordinate, sorted after active items within its verse group, labeled with the winning rule (e.g. _"Ignored always: 'the the'"_), with an `[Undo ▾]` control (§6.5). Rationale: removal makes a mis-click irreversible-in-place and makes "Ignore Always" indistinguishable from a fix; the card's intent (flag stops demanding attention) is preserved because greyed items don't count toward the dot. A **"Show ignored & OK" checkbox** (default ON, persisted in editor state) collapses them entirely for translators who want the card-literal view.
2. **Machine-"legitimate" findings are shown as inactive items.** Greek Room marks some repetitions `legitimate: true` (intentionally repeated words). The cards are silent on them. We render them in the same greyed style with reason _"Marked OK by Greek Room"_, surfaceable per-occurrence like any other inactive item (§6.4). This gives translators visibility into what the checker considered and a recourse when Greek Room is wrong in either direction.
3. **Dot mirrored on the panel-toggle button.** #277 places the dot on the Checks tab header, which is invisible when the whole left panel is closed (it's behind the `BookText` toggle button in the drafting header). To preserve the card's intent — the translator is notified — we mirror the dot on that toggle button whenever the panel is closed and active flags exist.

None of these block implementation; they are listed in §12 for explicit confirmation in PR review.

---

## 6. fluent-web design

### 6.1 File layout

```
fluent-web/src/
├── components/ui/                          # (existing; shadcn primitives incl. dropdown-menu, checkbox)
├── features/
│   ├── bible/components/DraftingPage.tsx    # MODIFIED: hosts LeftPanel instead of bare ResourcePanel;
│   │                                        #   saveCounter wiring; dot on BookText toggle
│   ├── bible/hooks/useResourceStatePersistence.ts  # MODIFIED: editor-state type gains new optional keys
│   ├── resources/components/ResourcePanel.tsx      # MODIFIED: "Resources" h3 heading removed (header
│   │                                        #   becomes the shared tab row); content otherwise untouched
│   └── checks/                              # NEW feature folder (mirrors features/resources)
│       ├── components/
│       │   ├── LeftPanel.tsx                # Tab container: header row (Resources | Checks + dot),
│       │   │                                #   renders ResourcePanel or ChecksPanel
│       │   ├── ChecksPanel.tsx              # Per-check accordion; verse groups; zero state;
│       │   │                                #   inline error line; "Show ignored & OK" toggle
│       │   └── FindingRow.tsx               # Snippet + actions (active: two buttons; inactive:
│       │                                    #   greyed + reason label + Undo split button)
│       ├── hooks/
│       │   ├── useRepeatedWordsCheck.ts     # useQuery keyed (chapterAssignmentId, saveCounter);
│       │   │                                #   builds request; returns raw findings
│       │   ├── useSuppressions.ts           # reads/writes occurrence rules (editor state) and
│       │   │                                #   global rules (user settings); feature detection
│       │   └── useResolvedFindings.ts       # pure cascade resolution -> {active[], inactive[]}
│       └── checks.types.ts                  # Request/response/envelope + rule types (snake_case
│                                            #   wire fields kept verbatim — see note below)
```

> **ℹ️ Intentional snake_case exception.** The wire types in `checks.types.ts` (`lang_code`, `snt_id`, `repeated_word`, `start_position`, …) mirror the fluent-ai contract verbatim, per fluent-api decision **D8** (reviewer-confirmed, fluent-api PR #173). Do not "normalize" them to camelCase; renaming silently breaks the contract. The exception is scoped to the checks wire types; UI-side derived types use camelCase as usual.

### 6.2 Trigger and request (W3, W4, W10)

The check is a chapter-wide `useQuery`:

```ts
const [saveCounter, setSaveCounter] = useState(0);
// In useAddTranslatedVerse usage (DraftingPage): onSuccess -> setSaveCounter(c => c + 1)

useQuery({
  queryKey: ['repeated-words', chapterAssignmentId, saveCounter],
  queryFn: () => postRepeatedWordsCheck(buildRequest(projectItem, verses)),
  enabled: !readOnly && versesWithContent.length > 0 && settingsProbeResolved,
  // TanStack retains previous data on refetch failure; see §9.2
});
```

- **Trigger:** `saveCounter` increments in the verse-save mutation's `onSuccess`, so the check fires exactly when card #172 specifies — on the auto-save event — and the panel refreshes per #278. The initial check on page load fires with `saveCounter = 0` (gives the dot its state when the translator arrives).
- **No extra debounce:** the per-verse 2 s save debounce already rate-limits typing bursts; the check is sub-second. If a heavier check joins later, a coalescing debounce can wrap `setSaveCounter` without touching anything else.
- **Request body** is the full `RepeatedWordsRequest` (D8 shape): `lang_code`/`lang_name` from the project's target language, `project_id`/`project_name` from `projectItem`, and `verses[]` covering **all currently drafted verses** of the chapter (content from the drafting state, not a refetch — what the translator sees is what gets checked).
- **`snt_id` = `"{bookCode} {chapter}:{verse}"`** with the USFM book code (e.g. `JDG 4:3`), the convention the repo smoke tests already use. Implementation note: verify the field carrying the USFM code on the drafting page's `projectItem` (vs. display name) and thread it into the builder.
- **Where it runs (W10):** drafting route only; `enabled` is false in the read-only `/view` route (reviewers see no Checks activity in v1), when no verse has content, and while the settings feature-detection probe (§9.1) is unresolved — the probe is a single fast `GET`, and waiting for it means the first findings render is already cascade-correct (the user's global rules are known, present or absent).
- **Emptied chapters resolve naturally:** any save of emptied text triggers a fresh check whose empty findings clear the panel and dot. (When *every* verse is emptied the query disables instead; the panel and dot then treat findings as empty rather than rendering stale data.)

### 6.3 Occurrence identity (W4)

A suppression must survive verse edits without our re-parsing text. The key is **`(snt_id, repeated_word, ordinal)`**:

- `ordinal` = index of this finding among findings in the same verse with the same `repeated_word`, ordered by `start_position` ("x of n"). Computed from **Greek Room's findings only** — we never tokenize verse text ourselves, so Greek Room's case/diacritic equivalence policy is inherited and consistent between runs.
- Ordinals survive unrelated edits (`start_position` does not). Adding or removing an *earlier* same-pair occurrence shifts later ordinals and conservatively re-flags — the safe failure direction.
- String comparison between a stored rule's `repeated_word` and a fresh finding's: **NFC-normalize both, compare exactly, no case folding of our own.** Unicode case folding is locale-sensitive (the Turkish dotless-ı problem) and Fluent targets minority languages; NFC handles composed/decomposed accent variation. Note that Greek Room already delivers `repeated_word` lowercased ("word word" form, per the fluent-ai schema) — original casing lives only in `surf`, which we display but never compare — so case equivalence is wholly Greek Room's policy, inherited rather than re-implemented.
- Documented caveat: a triple repetition ("the the the") yields two overlapping findings (ordinals 1 and 2). Mechanically fine; slightly odd UX; accepted for v1.

### 6.4 The active/inactive cascade (W5)

Every finding resolves through three layers; the **most specific non-silent verdict wins** (specificity, not temporal order — deterministic and reproducible from stored state):

| Layer | Scope | Verdicts |
| --- | --- | --- |
| 0 — Greek Room | this finding | `active` (suspicious) / `inactive` (`legitimate: true`) — always present |
| 1 — User global | word pair, all the user's projects | _silent_ / `suppress` / `surface` |
| 2 — Occurrence | `(snt_id, repeated_word, ordinal)`, this chapter assignment | _silent_ / `suppress` / `surface` |

- Stored rules are **tri-state maps** (`key → 'suppress' | 'surface'`, absent = silent), not bare suppression sets — `surface` is what makes per-occurrence undo of a global rule (or of a Greek Room `legitimate` verdict) possible.
- A machine-legitimate finding is conceptually "pre-ignored by Greek Room": same inactive state as user-ignored, different actor, same undo affordance.
- **The notification dot counts cascade-resolved active findings only.**
- Inactive findings render greyed, sorted after active items within their verse group, each labeled with the winning rule (_"Ignored this time"_, _"Ignored always: 'અને અને'"_, _"Marked OK by Greek Room"_). The **"Show ignored & OK"** checkbox (default ON so the undo affordance is discoverable; persisted in editor state) hides them.

### 6.5 Action surface (W6)

- **Active finding** (per card #278): `[Ignore This Time]` → writes occurrence rule `suppress`; `[Ignore Always]` → writes global pair rule `suppress`.
- **Inactive finding:** one `[Undo ▾]` split button (shadcn `dropdown-menu`, already in the codebase — no hidden gestures):
  - **Default click** acts at the occurrence layer: if inactive via its *own* occurrence rule → delete that entry; if inactive via a global rule or Greek Room's verdict → write an occurrence-level `surface` override (the global rule / machine verdict survives; only this occurrence resurfaces).
  - **Chevron menu** offers the deliberate global actions with consequence-naming labels, e.g. _"Stop ignoring 'the the' everywhere"_ (deletes the global entry).
- **Global writes purge local rules — current chapter only.** Executing any global (`always`) suppress or surface first deletes the user's occurrence-level rules for that word pair in the *current chapter assignment's* editor state, then writes the global rule. This is purely UI coherence: without it, the just-clicked panel would appear to ignore the action (occurrence beats global in the cascade). Occurrence rules in **other** chapters/projects deliberately stand — they were specific pronouncements, and we don't revert decisions from afar. Client-side operation; no special endpoint semantics.
- **No confirmation dialogs:** global rules are reversible via the chevron (and a future settings page, §11), so `[Ignore Always]` does not nag.
- **Direct edits resolve silently** (card #278): if the translator fixes the text, the next auto-save's fresh findings simply no longer contain the occurrence — no action needed, panel and dot update.

### 6.6 Left-panel container and persisted UI state (W11)

`DraftingPage` currently renders `ResourcePanel` directly inside the resizable left panel (with `showResources` toggled by the `BookText` button in the drafting header). This proposal inserts a thin `LeftPanel` tab container at that spot:

- **`LeftPanel`** owns the tab header row ("Resources | Checks", blue underline on the active tab, blue dot right of "Checks" when active findings exist) and renders either the existing `ResourcePanel` or the new `ChecksPanel` below it. `ResourcePanel` loses only its `<h3>Resources</h3>` heading (the tab row replaces it); its content, language dropdown, and accordion are untouched.
- The dot's state comes from the cascade-resolved active count (§6.4), which `DraftingPage` computes once and threads to both `LeftPanel` (tab dot) and the header toggle button (mirror dot, §5.3 item 3). The check query runs at `DraftingPage` level — **not** inside `ChecksPanel` — so the dot stays live while the Resources tab (or a closed panel) is showing.
- **Persisted UI state.** Two new keys ride the same per-chapter editor-state blob the page already saves (debounced 500 ms, §7.1): `activeLeftTab: 'resources' | 'checks'` (reopen where you left off) and `showResolvedChecks: boolean` (the "Show ignored & OK" checkbox, default `true`). Both are cosmetic; failure to persist degrades to defaults.
- The panel's existing resize/drag behavior and 20–40 % width constraints are inherited unchanged — `LeftPanel` lives *inside* the resizable container.

---

## 7. Persistence design (W2)

Two stores, each at exactly the scope of the rule it holds. Both are Zod-typed JSONB blobs following the codebase's existing pattern; neither requires fluent-ai or proxy changes — **findings are filtered client-side** in fluent-web, keeping `POST /ai/tools/greek-room/repeated-words` the pure pass-through that D8/D9 established.

### 7.1 Occurrence rules — extend the editor-state blob (no migration)

The `user_chapter_assignment_editor_state` table already stores a per-`(user, chapterAssignment)` JSONB blob, validated by `editorStateResourcesSchema` (fluent-api [`src/db/schema.ts`](https://github.com/eten-tech-foundation/fluent-api/blob/main/src/db/schema.ts)):

```ts
// fluent-api/src/db/schema.ts — today
export const editorStateResourcesSchema = z
  .object({
    activeResource: z.string().min(1),
    bookCode: z.string().min(1),
    chapterNumber: z.number(),
    verseNumber: z.number(),
    languageCode: z.string().min(1),
    tabStatus: z.boolean(),
  })
  .nullable();
```

"Ignore This Time" is scoped to *this user's view of this chapter assignment* — precisely this table's grain. The fluent-api PR extends the schema with **optional** keys (old rows parse unchanged; **no SQL migration** — the column is already JSONB):

```ts
export const editorStateResourcesSchema = z
  .object({
    activeResource: z.string().min(1),
    bookCode: z.string().min(1),
    chapterNumber: z.number(),
    verseNumber: z.number(),
    languageCode: z.string().min(1),
    tabStatus: z.boolean(),
    // --- NEW, all optional (backward/forward compatible) ---
    activeLeftTab: z.enum(['resources', 'checks']).optional(),
    showResolvedChecks: z.boolean().optional(),
    checkOccurrenceRules: z
      .record(z.string(), z.enum(['suppress', 'surface']))
      .optional(),
  })
  .nullable();
```

- `checkOccurrenceRules` is the tri-state map of §6.4 layer 2. Keys are the occurrence identity `"{snt_id}|{repeated_word}|{ordinal}"` (e.g. `"JDG 4:3|અને અને|1"`); the `|` separator cannot appear in a `snt_id` and `repeated_word` is the final segment-pair, so keys are unambiguous. Values: `'suppress'` ("Ignore This Time") or `'surface'` (per-occurrence undo of a global/machine verdict). Absent = silent.
- fluent-web reads/writes these through the **existing** `GET/PUT /chapter-assignments/:id/editor-state` round-trip it already performs — the same debounced save that persists `activeResource` today carries the new keys. No new endpoint for occurrence rules.
- Write pattern: read-modify-write of the blob the page already holds in memory. The page is the only writer for this `(user, chapterAssignment)` pair in practice (concurrent same-user tabs are a pre-existing last-writer-wins, inherited).

### 7.2 Global rules — new `user_settings` table

"Ignore Always" is user-global ("across all of the user's projects", card #278). No user-global preference store exists in Fluent yet; this proposal **deliberately establishes one** rather than minting a word-pair-specific table, so the next user-level preference (theme, notification opt-outs, …) is a schema-key addition instead of a migration:

```ts
// fluent-api/src/db/schema.ts — NEW
export const userSettingsSchema = z
  .object({
    checkIgnoredWordPairs: z
      .record(z.string(), z.enum(['suppress', 'surface']))
      .optional(),
  })
  .catch({}); // unknown/old shapes parse as empty, never throw (W8)

export const user_settings = pgTable('user_settings', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<z.infer<typeof userSettingsSchema>>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

- **One row per user** (`userId` is the primary key), one Zod-typed JSONB `settings` column — the same shape discipline as `user_chapter_assignment_editor_state`, one level up the scope ladder.
- `checkIgnoredWordPairs` is the §6.4 layer-1 map. Keys are the NFC-normalized `repeated_word` string (the pair, e.g. `"the the"`); values `'suppress'` ("Ignore Always") or `'surface'` (reserved — a global "never let Greek Room auto-OK this pair" is expressible but no v1 UI writes it). Absent = silent.
- Requires **one SQL migration** (new table; follows the numbered-migration convention in `src/db/migrations/`).
- Exposed via `GET/PUT /users/settings` (§8).

### 7.3 Why client-side filtering

The alternative — teaching the AI proxy to subtract suppressed findings server-side — was rejected:

1. It breaks the proxy's reviewed role as a **verbatim pass-through** (D8: contract mirrored exactly; D9: envelope passthrough). Filtering injects Fluent domain state into an AI-contract endpoint.
2. The cascade needs *all* findings anyway to render inactive items with reason labels (§5.3 item 1) — a server that pre-filters would have to return them annotated regardless, which is the client cascade with extra steps.
3. Suppression maps are small (a translator's ignore list, not a corpus) and already at the client's fingertips via blobs it loads for other reasons.

The proxy therefore remains untouched by this proposal.

---

## 8. fluent-api design: `GET/PUT /users/settings` (W7)

The settings endpoint deliberately mirrors the editor-state endpoint one level up the scope ladder — `user_settings` is to *user* what `user_chapter_assignment_editor_state` is to *(user, chapterAssignment)*. Same idiom throughout: **session-implicit user** (the authenticated user is taken from context, never from the URL — consistent with `user-chapter-assignment-editor-state.route.ts`, where no `userId` appears in the path), **full-replace upsert** on PUT, one Zod-typed JSONB blob.

### 8.1 Routes

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/users/settings` | session (any authenticated user) | — | `200` `{ settings: UserSettings \| null, updatedAt }` — `settings: null` when the user has no row yet (mirrors editor-state's no-state-yet response; **not** a 404) |
| `PUT` | `/users/settings` | session (any authenticated user) | `{ settings: UserSettings }` | `200` saved state; `400` on schema violation |

- **No special permission** beyond an authenticated session: every user owns exactly their own settings row, and the handler scopes all reads/writes to `currentUser.id`. (Editor-state additionally guards with `CONTENT_UPDATE` + chapter-assignment participation because it is tied to a chapter resource; settings have no resource to scope, so session identity alone is the right guard.)
- **PUT is full-replace.** The client GETs, merges in memory, PUTs the whole blob — the editor-state write pattern. Concurrent tabs are last-writer-wins, identical to editor-state's accepted behavior; for an ignore-list this worst case is "one ignore from another tab is lost until re-clicked."
- Rejected alternatives, for the record: `/user-settings` (breaks the `domains/users` nesting), `/users/me/settings` (no `me` convention exists in this API), and per-feature endpoints like `/users/settings/check-ignores` (the blob is one document; sub-paths invite partial-update semantics we don't need).

### 8.2 File layout

```
fluent-api/src/domains/users/settings/
├── user-settings.route.ts        # GET + PUT, OpenAPI-described, session user from context
├── user-settings.service.ts      # get / upsert, Result-typed like editor-state service
├── user-settings.repository.ts   # drizzle upsert on userId PK (onConflictDoUpdate)
└── user-settings.types.ts        # response schema; re-exports UserSettings from db schema
```

Plus: the `user_settings` table + `userSettingsSchema` in `src/db/schema.ts` (§7.2), one numbered migration in `src/db/migrations/`, and route registration in `src/app.ts` next to the existing users routes.

### 8.3 What fluent-api explicitly does **not** do

- No server-side filtering of check findings (§7.3).
- No change to `POST /ai/tools/greek-room/repeated-words` or anything under `lib/services/fluent-ai/`.
- No per-key PATCH semantics, ETags, or optimistic concurrency — not until a real conflict problem shows up (the editor-state endpoint has run without them).

---

## 9. Degradation, failure, and rollout

### 9.1 Feature detection for the settings half (W8)

The two PRs (fluent-web, fluent-api) may land and deploy in either order, so the UI must not assume `GET /users/settings` exists:

- On drafting-page mount, `useSuppressions` probes `GET /users/settings` once per session. **`404` ⇒ `globalIgnoresAvailable = false`** for the session (the route doesn't exist yet on this deployment); any 2xx — including `settings: null` — ⇒ available.
- When unavailable, the **capability is hidden, not disabled**: `[Ignore Always]` is simply not rendered, and the `[Undo ▾]` chevron omits global entries. A dead button is a bug report; an absent one is honest. Occurrence-level ignores (editor-state-backed) work regardless.
- The check query waits for the probe to resolve before its first run (W10, §6.2) — one fast `GET`, so findings never render ahead of the user's global rules. The probe resolves on any terminal response: 2xx ⇒ available, `404` ⇒ unavailable; a network failure resolves it as unavailable for the session (conservative: occurrence ignores only).
- **Unknown-key tolerance both ways:** `userSettingsSchema` uses `.catch({})` server-side; client-side parsing treats absent/unknown keys as empty. A newer client against an older blob (or vice versa) degrades to "no global rules," never to an error. The same applies to the editor-state blob's new optional keys (§7.1) — old clients ignore them, old rows omit them.

### 9.2 Check-call failure (W9)

When the repeated-words query errors (network, 502 `AI_SERVICE_UNAVAILABLE` / `AI_TOOL_EXECUTION_FAILED` from the proxy):

- A single inline line renders at the top of the Checks panel: `Checks failed to refresh` in `text-sm text-red-500` — the drafting page's own status idiom (it already shows "Auto-save failed" inline in the header). **No toast, banner, or popup**; none exist in this codebase and a transient check hiccup doesn't warrant introducing one.
- TanStack Query retains the last successful `data` on refetch failure, so the panel **keeps rendering the last-known findings** below the error line, and the dot reflects that last-known state. The failure mode is "results are one save behind," not "results vanish."
- The error is logged via the existing `Logger` for diagnosis; the next successful auto-save naturally retries (new `saveCounter` key).
- A failure on the *initial* load (no previous data) renders the error line over an empty section — not the "No issues found" zero state, which must never appear on error.

### 9.3 Suppression-write failure

Ignore actions apply **optimistically** (the finding greys immediately) and roll back on write failure:

- Occurrence rules ride the debounced editor-state save; a failed save leaves the in-memory rule intact and retries with the next editor-state write (the page already tolerates editor-state save failures this way).
- Global rules PUT immediately; on failure the optimistic update is reverted (the finding returns to active) and the action can be re-clicked. No queued retry for v1 — the user sees the flag come back, which *is* the failure notification.

### 9.4 Rollout / landing order (W12)

- **Two PRs**, one per repo, each referencing this proposal and cards #277/#278 (and #172 for the fluent-api half). Either lands first:
  - fluent-web first ⇒ probe 404s ⇒ occurrence ignores only, no `[Ignore Always]` (§9.1). Fully usable.
  - fluent-api first ⇒ new table/endpoint sits unused. Harmless.
- The editor-state schema-key extension (§7.1) is backward/forward compatible by construction (optional keys, JSONB column unchanged), so no coordination is needed there either.
- No new env vars, services, or fluent-platform changes; the feature follows the existing deploy pipeline of each repo.

---

## 10. Testing

### 10.1 fluent-web (Vitest + Testing Library + MSW — the repo's new test stack)

The repo now ships test infrastructure under `src/test/` (`msw/server.ts`, `render.tsx`, `setup.ts`); all UI tests use it — MSW intercepts at the network boundary, so the hooks under test exercise their real fetch paths.

| Area | Representative cases |
| --- | --- |
| `useResolvedFindings` (pure) | Cascade precedence table: machine-legitimate vs. global vs. occurrence, `suppress`/`surface`/silent at each layer, most-specific-wins; ordinal assignment incl. "the the the" overlap; NFC composed/decomposed key equivalence. |
| `useRepeatedWordsCheck` | Fires on `saveCounter` change; request body shape (snake_case verbatim, `snt_id` format, all drafted verses); `enabled` gating (readOnly, empty chapter); previous data retained on 502 (MSW error handler). |
| `useSuppressions` | Feature-detect: 404 ⇒ `globalIgnoresAvailable=false`; 200-with-null ⇒ available; occurrence rule round-trip through editor-state blob; global write purges current-chapter occurrence rules for the pair; optimistic rollback on PUT failure. |
| `ChecksPanel` / `FindingRow` | Verse grouping + separators; zero state (and *not* on error); inline error line; active buttons vs. greyed-with-reason + `[Undo ▾]`; "Show ignored & OK" toggle; `[Ignore Always]` absent when capability unavailable. |
| `LeftPanel` / dot | Dot iff cascade-active > 0, visible from Resources tab; tab switch persistence key written; toggle-button mirror dot when panel closed. |

### 10.2 fluent-api (Vitest, route-level — same style as the ai-tools and editor-state tests)

| Area | Representative cases |
| --- | --- |
| `GET /users/settings` | 401 unauthenticated; `settings: null` for new user (200, not 404); returns saved blob; user isolation (only own row). |
| `PUT /users/settings` | Upsert create + replace; 400 on schema violation; full-replace semantics (omitted keys gone); `.catch({})` tolerance on read of unknown-shaped stored blobs. |
| Editor-state schema extension | Existing editor-state tests still pass unchanged (proves backward compatibility); round-trip of `checkOccurrenceRules` / `activeLeftTab` / `showResolvedChecks`. |

Manual verification continues to use the stack via `fluent-platform` compose plus the existing repeated-words smoke script for the proxy half.

---

## 11. Future work (explicitly deferred)

- **Sibling checks** (Wildebeest character check, spell check — draft cards exist on the board): each becomes another accordion section in `ChecksPanel` and another wire-type module; the cascade, dot, and suppression stores are check-agnostic by construction (occurrence keys embed the finding identity; global keys can be namespaced per check when a second one arrives).
- **"Manage ignored words" settings page**: a CRUD view over `userSettings.checkIgnoredWordPairs`. The store and endpoint are already shaped for it.
- **Checks in review/read-only stages** (peer check, `/view` route): needs product definition of who may ignore what; W10 keeps v1 to drafting.
- **Async/polling tools**: the envelope is consumed whole (D9), so a `status: "queued"` tool slots in with a polling loop inside `useRepeatedWordsCheck` and zero UI-contract change.
- **"Drop duplicate" quick-fix and Greek Room feedback loop**: excluded by card #278; the occurrence identity (`snt_id`, pair, ordinal, `start_position` at render time) is sufficient input for both when they're picked up.

---

## 12. Sign-off checklist

Items needing explicit confirmation in review (referenced from §5.2/§5.3); none block reading the rest of the design:

| # | Item | Proposed resolution |
| --- | --- | --- |
| S1 | Zero-state mock shows the notification dot; #277 text says no flags ⇒ no dot | Follow the text: no dot at zero active flags |
| S2 | #278 mocks show the Resources language dropdown above checks content | Omit it on the Checks tab (presumed screenshot carryover; no function for checks) |
| S3 | Card says ignored items are "removed from the panel" | Grey-and-stay with reason label + undo; "Show ignored & OK" unchecked gives the card-literal view; dot unaffected either way |
| S4 | Cards silent on Greek-Room-`legitimate` findings | Show as inactive items ("Marked OK by Greek Room"), per-occurrence surfaceable |
| S5 | Dot is invisible when the whole left panel is closed | Mirror the dot on the panel-toggle button while closed |
| S6 | Suppression persistence has no card of its own | Ship as extension of #172's scope (W1) — backend dependency of the UI cards |

Engineering-side confirmations sought from reviewers (same spirit as the D-series confirmations in the fluent-api proposal):

- **W2/W7** — blessing `user_settings` as Fluent's general user-preference store and `GET/PUT /users/settings` as its endpoint (this outlives the feature).
- **W4** — `(snt_id, repeated_word, ordinal)` occurrence identity and NFC-no-case-folding comparison.
- **W5/W6** — the tri-state cascade and the `[Undo ▾]` split-button behavior.

---

*Prepared against fluent-web `main` (post `0dcea61`), fluent-api `main` (post `7c7f63d`), and the approved fluent-api proposal (PR #173). Author: JEdward7777.*
