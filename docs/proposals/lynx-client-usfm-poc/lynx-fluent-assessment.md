# What Lynx Can Do for Fluent

**Companion to:** [`design.md`](design.md) · the running demo at `/lynx-usfm` (authenticated route) on the reference branch `poc/lynx-client-usfm` ([PR #327](https://github.com/eten-tech-foundation/fluent-web/pull/327)).
**Grounding:** the 2026-02-10 Lynx|Fluent technical discovery session (Damien Daspit, Benjamin King, JoEllen Magnus / Joel Mathew, Kasey W), the Repeated Word Check UI proposal (`docs/proposals/repeated-word-check/`, PR #305), and what this PoC empirically proved.

## 1. What Lynx is

[Lynx](https://github.com/sillsdev/lynx) (SIL, MIT, published on npm) is a TypeScript library for adding quality checking and formatting assistance to scripture editing environments, deliberately modeled on the Language Server Protocol: **diagnostic providers** report issues with ranges and severities, offer **quick fixes** (text edits), and **on-type formatting providers** correct text as the user types. A **workspace** orchestrates any number of providers behind one API; a **document manager** feeds them a format-agnostic, typed **`ScriptureDocument`** node tree (books/chapters/verses/paragraphs/notes/…) with USFM and Quill-Delta backends today. It runs entirely in the browser (Scripture Forge is the production proof; this PoC is the Fluent-stack proof) and is equally happy in Node (SIL's VS Code extension, future Paratext extension).

## 2. Why this fits Fluent specifically

In the February meeting Joel framed the need precisely: Fluent wants an increasing list of checks (Greek Room first) **without a bespoke integration per tool** — "a standard interface where different checking tools can be integrated into… and we don't have to change the UI side drastically."

Fluent's first check is now designed: the Repeated Word Check UI proposal builds a Checks tab + per-check accordion panel with Ignore Here/Everywhere suppression, refreshed on auto-save, explicitly anticipating sibling checks (Wildebeest, spell check). Every concept in that proposal has a general Lynx counterpart:

| Repeated Word Check proposal (bespoke) | Lynx (general) |
| --- | --- |
| `useRepeatedWordsCheck` hook per check | `DiagnosticProvider` per check behind one `Workspace` |
| Findings envelope from the fluent-ai proxy | `Diagnostic { source, range, severity, message, data }` |
| `snt_id` + word + ordinal occurrence identity | `Diagnostic.fingerprint` (landing on Lynx HEAD) |
| Ignore Here / Everywhere cascade in editor-state / `user_settings` | `DiagnosticDismissalStore` interface (Lynx HEAD) — Fluent implements it over those same stores |
| "Show Ignored" + Undo | dismissal filtering built into `Workspace` |
| deferred "Drop duplicate" one-click fix | `DiagnosticFix` (edits) — the machinery already exists |
| chapter re-check on every auto-save | `DocumentManager.fireChanged` + push-based `diagnosticsChanged$` |

None of this forces a rewrite of the in-flight Repeated Word work. The realistic sequence is: land #277/#278 as designed, and when check **#2** arrives, put the panel on a `Workspace` so the third, fourth, fifth check are providers, not projects.

**The second thing Lynx buys is the document model itself.** Fluent stores per-verse plain text; USFM exists only server-side (usfm-grammar import, string-concatenation export). Joel: "we are already hitting the need for having more formatted scripture content on the screen… that entails deciding what is the data model." Lynx's `ScriptureDocument` is that model, shared with Scripture Forge and Paratext lineage — and the PoC shows the front end deriving it on the fly from the verses Fluent already has, so adopting it requires **no storage change**.

## 3. What the PoC proves

Run it from the reference branch: `/lynx-usfm` (any authenticated user; sample loads automatically, "Assemble chapter → USFM" pulls live data).

1. **USFM parses to a typed document in the browser** — chapters, verses, paragraphs walked from the node tree, rendered as a formatted scripture preview and a node inspector; ~3 ms for the sample, ~28 ms for a real 31-verse chapter. No server round-trips after load.
2. **Real checks run live**: the four `StandardRuleSets.English` providers (quotation pairing, allowed characters, paired punctuation, punctuation context) plus a vendored verse-order provider (the template for Fluent-authored providers). Diagnostics carry ranges → inline underlines in the editor and **verse references** (via the node tree) → verse-grouped rows in a Checks-panel-shaped UI with fix/ignore/undo.
3. **Quick fixes and on-type formatting work end-to-end**: "Insert missing verse" splices a correct `\v 4` edit; typing `"` autocorrects to the context-correct curly quote at the caret.
4. **One canonical representation**: the PoC assembles USFM from verses with the *same logic as the server export* (`generateUSFMText` mirrored), fetched from the same bible-texts endpoint the drafting page uses — Kasey's "lint the export" idea, running before anything leaves the browser. The same module works in fluent-api tests.
5. **It fits the stack**: Vite 8 + React 18 + TS 6 + TanStack Router; the whole feature is one lazy route chunk (75 KB gzip); 14 vitest specs cover the non-UI modules.
6. **Three packaging hazards found and worked around** (browser-first consumer feedback SIL doesn't have yet — see design.md §5): file-based `UsfmStylesheet` construction, module-scope Node calls in `@sillsdev/machine`, and bundler-hostile locale loading in the checker package.
7. **Rule sets must be per-language**: English rules over Gujarati text → ~2,600 allowed-character warnings. The configs are builder-based (`QuotationConfig`, `CharacterRegexWhitelist`…); deriving them from the project's target language is a real integration workstream — and a concrete collaboration topic with SIL.

## 4. Where Lynx helps, ranked

1. **Checks panel engine (the "easy win" JoEllen asked about).** Back the proposed Checks tab with a `Workspace`; punctuation/quotation/character checks come free and run offline-fast; the panel stops being per-check plumbing. Effort: the PoC's `useLynxDocument` hook is most of the shape.
2. **Greek Room / Wildebeest / spell check as providers.** Exactly the pattern discussed in February: a `DiagnosticProvider` that debounces, calls the existing fluent-api → fluent-ai proxy, and maps findings to `Diagnostic`s (range from verse + offsets). The provider owns batching/caching policy — and Joel's caching idea is a shareable utility SIL wants too.
3. **Per-language rule sets.** Small, high-leverage: a rule-set factory keyed by target language (quote conventions, character sets, punctuation) — likely the first thing Fluent contributes upstream that other Lynx consumers reuse.
4. **Export linting.** Run `getDiagnostics` over assembled USFM client-side before download and as a fluent-api test over export output (Kasey's use case; the PoC's assembly module is isomorphic).
5. **The editor/document-model decision.** When Fluent picks a rich editor ("we don't want to make our own editor"), Lynx keeps the checking layer editor-agnostic: Scripture Forge pairs it with Quill via `lynx-delta`; a Fluent editor would bind the same workspace to its change events. Adopting `ScriptureDocument` as the shared representation now (derived, not stored) keeps that door open — including the shared-editor synergy Damien floated.
6. **Mobile.** The companion app runs the same TypeScript; local checks (punctuation, verse order) work offline, which Kasey flagged as the forcing function for client-side checking.

## 5. What Fluent gives back (the collaboration Damien invited)

- The three packaging fixes (browser-safe stylesheet construction, guarded module-scope Node calls, bundler-friendly locales) — small PRs with an eager first consumer.
- Browser/bundler CI coverage for lynx-usfm (SIL currently exercises it only in Node).
- Requirements pressure on the dismissal/fingerprint work in progress (Fluent's Ignore Here/Everywhere cascade is a concrete `DiagnosticDismissalStore` implementation) and on the caching utility.
- Per-language rule sets, and eventually a Greek Room provider other Lynx hosts (Scripture Forge, Paratext) could adopt — the "bigger collaboration" from the meeting.

## 6. Risks and open questions

- **Pre-1.0 API drift.** Published core is 0.3.5; HEAD already renames `getDiagnosticFixes` → `getDiagnosticActions` and adds dismissal. Pin versions, expect small migrations, and use the collaboration channel (SIL offered repo access + joint review of core changes) to see changes coming.
- **Localization.** Lynx localizes via its own i18next instance; packages ship `en`/`es`/`npi` today. Fluent needs `hi` (and later others) — contribute locale files upstream or register app-side namespaces (the PoC shows the mechanism).
- **Verse-scoped UX vs document-scoped checks.** Quotation analysis is a document-wide quote stack; an unclosed quote in verse 5 can surface at verse 12. Verse-grouped display works (the PoC maps ranges → verses), but messaging may need care.
- **Sustained SIL bandwidth.** JoEllen was explicit that integration time can flex toward Lynx but nothing is formally planned; Bianca's funding thread matters for pace.

## 7. Suggested next steps

1. Demo `/lynx-usfm` at the next Lynx|Fluent sync; walk the three upstream findings with Damien.
2. File the three packaging issues on sillsdev/lynx + sillsdev/machine (offer the PoC's workarounds as PRs).
3. Spike a Hindi/Gujarati rule set to size the per-language configuration work.
4. Decide the engine question for the Checks panel at check #2: adopt `Workspace` + write the Greek Room provider against the existing proxy.
5. Feed Fluent's suppression-cascade requirements into SIL's in-flight dismissal design (it is being built for pluggable stores *right now* — February transcript).
