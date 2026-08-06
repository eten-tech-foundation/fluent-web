# Lynx Client-Side USFM PoC — Design

**Status:** PoC (exploratory, not for production merge as-is).
**Code:** stays on the reference branch `poc/lynx-client-usfm` ([PR #327](https://github.com/eten-tech-foundation/fluent-web/pull/327)); only this design doc lands on `main`.
**Date:** 2026-07-01.

## 1. Background

Fluent stores translations as **per-verse plain text** and only ever materializes USFM **server-side**: fluent-api parses uploaded USFM with `usfm-grammar` (`src/lib/usfm-converter.ts`) and assembles USFM on export (`generateUSFMText`, streamed as a ZIP consumed by `useExportUsfm.ts`). The web app has **no scripture document model** — the drafting editor is a plain `<textarea>` per verse (`DraftingPage.tsx`).

[Lynx](https://github.com/sillsdev/lynx) (SIL, MIT) is a TypeScript library for adding **diagnostics, quick fixes, and on-type formatting** to translation editors, modeled on LSP. The February 10, 2026 discovery session (Damien Daspit, Benjamin King, JoEllen Magnus / Joel Mathew, Kasey W) established:

- Lynx runs **entirely in the browser** (proven in Scripture Forge) — published npm packages: `@sillsdev/lynx` (core), `@sillsdev/lynx-usfm`, `@sillsdev/lynx-punctuation-checker`, `@sillsdev/lynx-delta`.
- Checkers operate on a format-agnostic **`ScriptureDocument`** typed node tree (books/chapters/verses/paragraphs/notes/…); USFM, Delta (and potentially USJ/USX) are interchangeable backends.
- Greek Room–style server checks fit as **`DiagnosticProvider`s that call a backend**, with the provider controlling debounce/batching.
- JoEllen's "easy win" framing: integrate the Lynx interface with the existing punctuation checker first; Greek Room provider later.
- Kasey's idea: run Lynx as a **linter over USFM exports**.

Meanwhile, the merged-on-main **Repeated Word Check UI proposal** (`docs/proposals/repeated-word-check/`, PR #305) designs a Checks tab + per-check accordion panel with Ignore Here/Everywhere suppression — explicitly anticipating more checks (Wildebeest, spell check). Each new check currently implies bespoke plumbing (hook, identity keys, suppression cascade). Lynx's `DiagnosticProvider` / `Diagnostic.fingerprint` / `DiagnosticDismissalStore` are the general form of exactly those parts.

## 2. Goal

Prove, inside fluent-web's real stack (Vite 8, React 18, TS 6, TanStack Router, Tailwind 4 + shadcn), that:

1. `@sillsdev/lynx-usfm` can parse USFM into a **typed `ScriptureDocument` in the browser** — no server round-trip.
2. The front end can **understand verse structure natively**: walk the node tree, render chapters/verses/paragraphs, map any text range to a verse reference.
3. One **canonical client-side USFM representation** can be derived from Fluent's per-verse data (same assembly the export endpoint uses) and shared across checks and formatting.
4. Real Lynx checks run live on it: the four `StandardRuleSets.English` punctuation/quotation/character providers plus a custom provider (vendored verse-order example — the template for a future Greek Room provider), with **diagnostics, quick fixes, dismissal, and on-type smart quotes**.

### Non-goals

- No changes to `DraftingPage` or any production flow; the PoC is one isolated authenticated route.
- No editor decision (Quill/Lexical/CodeMirror is a separate track); a `<textarea>` + overlay is enough to prove the engine.
- No Greek Room calls; the vendored provider demonstrates the provider contract only.
- No persistence of dismissals (in-memory; the write-up maps it to `user_settings`/editor-state).

## 3. Approaches considered

- **A. Standalone sandbox app.** Fast, zero risk — but proves nothing about fluent-web's bundler/TS/i18n reality, and lands no reusable code. Rejected.
- **B. Isolated PoC route inside fluent-web (chosen).** Proves the actual integration surface (Vite dep handling, engine-strict, conventions), can pull real chapter data through existing endpoints, and is demoable/PR-able to the team.
- **C. Wire Lynx into the drafting textarea now.** Most "real," but pre-empts the open editor/document-model decision and turns a PoC into a product change. Rejected for now; the PoC's verse-mapping section is designed to show how C would work later.

## 4. Architecture

```
src/features/lynx/
  assets/usfm.sty                  # vendored Paratext stylesheet (see §6.1)
  lib/
    stylesheet.ts                  # browser-safe UsfmStylesheet construction
    usfm-assembly.ts               # verses -> USFM (mirror of fluent-api generateUSFMText)
    workspace.ts                   # createLynxWorkspace(): Localizer + factories + providers
    verse-order-provider.ts        # vendored @sillsdev/lynx-examples provider (provenance header)
    locales/…                      # vendored en/es JSON for the provider namespace
    verse-map.ts                   # ScriptureDocument walk: structure snapshot + range->verse ref
    sample-usfm.ts                 # demo USFM with seeded issues
  hooks/
    useLynxDocument.ts             # document lifecycle + diagnostics subscription + edits
  components/
    LynxUsfmPocPage.tsx            # page shell, source switcher (sample | chapter API)
    UsfmEditor.tsx                 # textarea + diagnostic highlight overlay + on-type quotes
    ChecksPanel.tsx                # per-check accordion, verse-grouped, fixes/dismiss
    StructurePanel.tsx             # typed node tree + formatted scripture preview
src/routes/_authenticated/lynx-usfm.tsx   # thin route file (TanStack file-based)
```

**One Workspace per page mount.** `useLynxDocument` owns a single `Workspace<TextEdit>` + `DocumentManager<UsfmDocument>` created once (ref), `fireOpened` on mount / source change, `fireChanged` with **full-content replace** on each edit (Lynx re-parses incrementally line-wise internally; per-keystroke incremental ranges are an optimization the PoC doesn't need), `fireClosed` on unmount.

**Data flow (edit cycle):**

1. `UsfmEditor` onChange → hook state → `documentManager.fireChanged(uri, { contentChanges: [{ text }], version: n+1 })`.
2. Providers emit on `workspace.diagnosticsChanged$` (push, RxJS) → hook merges per-source → React state.
3. `verse-map.ts` re-walks `document.findNodes(...)` → structure snapshot (chapters, verses, ranges) → panels re-render; `verseRefAtRange` resolves each diagnostic to the last verse starting at or before its range **start** — a range spanning several verses is therefore labelled with the verse it opens in, not the one it ends in. It returns `undefined` when no verse starts at or before that point (`\id`/`\h`/`\mt` header lines): those findings still render, just without a verse chip. Findings are listed per provider, not bucketed by verse, so an unscoped diagnostic is never dropped.
4. Quick fix click → `workspace.getDiagnosticFixes(uri, d)` → `DiagnosticFix[]`; the clicked fix's `fix.edits` are applied to the string (via `document.offsetAt`) → back to step 1. The PoC's fixes carry a single edit; applying a multi-edit fix safely (one snapshot, overlap check, descending offsets) is left to the production implementation.
5. Dismiss click → app-side suppression keyed by `source|code|anchor|occurrence`, where `anchor` is the diagnostic's `verseRef` when one resolved and its `line:character` otherwise. The verse-anchored form survives re-parsing; **the positional fallback does not** — editing earlier text shifts the anchor and the dismissal is lost. Occurrence identity is the ordinal within `source|code` in document order — itself unstable, since fixing an earlier finding from the same provider and code renumbers the rest and a dismissal can then be dropped or slide onto a neighbouring finding; tolerable while dismissals are in-memory and per-session, but mapping the key onto `DiagnosticDismissalStore` needs a provider-supplied stable identity first. (The _published_ core 0.3.5 has no dismissal/fingerprint support yet — that is exactly the in-progress work Damien described in the February meeting, present on repo HEAD as `dismissDiagnostic` + `DiagnosticDismissalStore`. Emulating it client-side also mirrors how the Repeated-Word proposal filters findings.)
6. Typing a trigger char (from `getOnTypeTriggerCharacters()`) → `workspace.getOnTypeEdits(uri, pos, ch)` → apply (smart-quote autocorrect).

**Published-API note.** npm 0.3.5 differs from repo HEAD (and HEAD's README): providers implement `getDiagnosticFixes` returning `DiagnosticFix { title, isPreferred?, edits }` — there are no command actions, no `fingerprint` field, no dismissal store. The vendored verse-order provider is adapted accordingly (its "exclude verse" command action was dropped).

**Source modes:** (a) **Sample** — bundled USFM with seeded issues (default; works with no data dependencies); (b) **From chapter** — fetch source verses via the same endpoint the drafting loader uses (`GET /bibles/:bibleId/books/:bookId/chapters/:n/texts`), assemble USFM client-side with `usfm-assembly.ts`, then parse/check. Mode (b) is the "one canonical representation from real Fluent data" + "lint the export client-side" demonstration.

## 5. Browser hazards — all three predicted, all three confirmed live, all worked around

`@sillsdev/lynx-usfm` had apparently never been exercised in a browser (the VS Code extension is Node; Scripture Forge uses the Delta factory, not USFM). Status after live verification on 2026-07-01 — each is a ready-made upstream contribution for the collaboration Damien invited:

1. **CONFIRMED — `UsfmStylesheet` construction is file-based.** The public constructor reads from disk (`fs.readFileSync`); `parseTagEntries(content)` exists but is `private` in the types. Workaround (`lib/stylesheet.ts`): vendor `usfm.sty` (87 KB, from `@sillsdev/machine/dist/corpora/`, MIT; also not reachable through the package's `exports` map) as a `?raw` Vite asset and call `parseTagEntries` through a narrow, commented cast. Upstream ask: a content-based constructor/factory on `UsfmStylesheet`.
2. **CONFIRMED — `@sillsdev/machine` corpora crashes on import in the browser.** `usfm-stylesheet.mjs` computes `dirname(fileURLToPath(import.meta.url))` at module scope; the package's own `browser` field maps `fs`/`path`/`url` to empty modules, so the page died with `TypeError: fileURLToPath is not a function`. Workaround (`vite.config.ts` + `lib/node-shims.ts`): exact-match regex aliases (`/^(?:node:)?url$/` etc. — string keys are prefix-matched by Vite 8/rolldown and mangled `fs/promises` into a path under the shim) pointing the four ids at inert implementations; disabled under vitest, where real Node modules must remain. Upstream ask: guard the module-scope calls so the `browser` field alone suffices.
3. **CONFIRMED — checker locale JSONs don't survive dep optimization.** `createLocaleLoader`'s template-literal dynamic `import()` can't be rewritten by the optimizer; diagnostics rendered as raw i18next keys (`diagnosticMessagesByCode.…`). Workaround (`lib/workspace.ts`): `Localizer.addNamespace` is first-write-wins, so the five checker namespaces (`quotation`, `allowedCharacters`, `pairedPunctuation`, `punctuation-context`, `standardPunctuationFixes`) are pre-registered with statically imported, vendored `en.json` resources before `workspace.init()`. Upstream ask: bundler-friendly locale shipping (static import map or explicit exports).

Bundle: the whole feature (lynx core + usfm + punctuation-checker + machine corpora + rxjs + a second i18next instance + the raw `usfm.sty`) lands as one lazily loaded route chunk — **~326 KB, 75 KB gzip** — thanks to the router's `autoCodeSplitting`; the main bundle is untouched. Core pins i18next ^23 while the app uses ^26; the `Localizer` creates its own instance, so they coexist.

### Live findings beyond the hazards

- **Performance:** parse + all five checkers on the sample ≈ 3 ms; Genesis 1 (31 verses, Gujarati IRV, fetched from the local fluent-api and assembled client-side) ≈ 28 ms. Caveats before this number is used as a budget: single machine, single browser (Chromium), wall-clock of a handful of runs rather than p95/p99, and the pass runs **on the main thread**, so 28 ms overruns a 60 Hz frame (16.7 ms). The PoC needs no debouncing to feel immediate at chapter size, but a production integration editing longer documents should measure percentiles and plan for debouncing or a worker rather than assume headroom.
- **Rule sets are language-specific:** running `StandardRuleSets.English` over Gujarati text produced ~2,600 allowed-character warnings. Not a bug — the character whitelist and quote conventions are `RuleSet` builder configuration, and a real integration must derive them from the project's target language. This is a first-class agenda item for the SIL collaboration (what does a Gujarati/Hindi rule set look like?).
- **Quotation analysis is document-wide** (a quote-stack), so an unclosed quote early in a chapter shifts where later imbalances are reported. Fine for documents; worth thinking about for verse-scoped UX.

## 6. UI

Two-column layout under the standard authenticated header, all shadcn components already in the repo (Card, Badge, Button, Select, Accordion, Tooltip, Separator):

- **Left: USFM editor** — monospace textarea with an aligned overlay rendering wavy underlines/tints per diagnostic severity; issue count chips; on-type smart quotes live.
- **Right, tab 1 "Checks"** — deliberately echoes the Repeated Word Check panel proposal: one accordion section per provider (Quotation, Allowed Characters, Paired Punctuation, Punctuation Context, Verse Order), each finding **labelled with its verse** (chip omitted when the range sits outside any verse) plus context snippets, severity badges, `[Fix: …]` buttons for actions with edits, `[Ignore]` on every finding (app-side dismissal keyed by `source|code|anchor|occurrence`, with undo and a "Show ignored" toggle), zero state "No issues found".
- **Right, tab 2 "Structure"** — the typed node tree (type, range, preview) + a **formatted scripture preview** (chapter numbers, superscript verse numbers, paragraphs) rendered _purely from the parsed model_ — the "front end understands verse structure natively" money shot.
- Source switcher (Sample / From chapter with bible/book/chapter inputs) in the page header.

## 7. Verification

- **Vitest (jsdom)**: stylesheet builds in a browser-like env with no `fs`; sample USFM parses to expected book/chapter/verse counts; seeded issues produce expected diagnostics per source; missing-verse quick fix round-trips (apply edit → `\v 4` present in the text, that verse-order diagnostic gone); on-type smart quotes autocorrect a typed `"` to `“` via `getOnTypeTriggerCharacters()`/`getOnTypeEdits()`; verses→USFM assembly produces the marker structure the server's exporter emits. That last test asserts **structure, not byte equality** with `generateUSFMText` — enough to show the client can assemble checkable USFM, not enough to claim the two are interchangeable. Establishing canonical equivalence (exact output or a normalized golden fixture, over chapters with missing verses, empty text and markers outside the curated subset) is a prerequisite for ever round-tripping client-assembled USFM back into storage.
- **Live**: run the app against the local stack, drive the page (both source modes), screenshot; confirm no server round-trips during checking (network tab quiet after load).

## 8. What the PoC deliberately leaves open

Scope boundaries, recorded so a production integration starts from the real state rather than from this page's happy path.

- **Diagnostic lifecycle.** The hook renders whatever the last `diagnosticsChanged$` emission carried, per source. It does not correlate results with the document `version` that produced them, so a slow provider answering after a newer edit can briefly paint stale ranges; it does not clear findings while a re-check is in flight; and a provider that throws simply emits nothing, which the panel renders as the "No issues found" zero state. A real Checks panel needs version-tagged results, an explicit in-flight state, and an error state distinct from "clean" — otherwise a broken check looks like a passing one, which is the dangerous failure here.
- **Unscoped diagnostics.** Findings outside any verse render without a verse chip (see §4). Nothing groups them under a structural heading, and quotation analysis is document-wide, so an early unclosed quote can report against a later verse than the one a user would blame.
- **Multi-edit fixes.** Only single-edit fixes were exercised.
- **Canonical USFM.** Assembly is verified structurally, not byte-for-byte (see §7).
- **Rule sets are language-specific.** `StandardRuleSets.English` over Gujarati produced ~2,600 false warnings; a real integration must derive the rule set from the project's target language.

## 9. Follow-on roadmap this PoC informs (detail in `lynx-fluent-assessment.md`)

1. Checks panel engine: back the proposed Checks tab with a `Workspace` instead of per-check bespoke hooks; `fingerprint` ↔ occurrence identity, `DiagnosticDismissalStore` ↔ editor-state/user_settings suppression cascade.
2. Greek Room / Wildebeest / spell check as `DiagnosticProvider`s calling the existing fluent-ai proxy.
3. Export linting: run `getDiagnostics` over assembled USFM before download (client) and/or in fluent-api tests.
4. Editor track: when Fluent picks a rich editor, keep the Lynx document as the shared model (Scripture Forge precedent: Quill + lynx-delta).
