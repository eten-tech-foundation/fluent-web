# Lynx Client-Side USFM PoC — Design

**Status:** PoC (exploratory, not for production merge as-is).
**Branch:** `poc/lynx-client-usfm`.
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
3. `verse-map.ts` re-walks `document.findNodes(...)` → structure snapshot (chapters, verses, ranges) → panels re-render; each diagnostic gets a verse ref by range containment.
4. Quick fix click → `workspace.getDiagnosticActions(uri, d)` → apply returned `TextEdit[]` to the string (via `document.offsetAt`) → back to step 1. Command actions (`excludeVerse`) go through `workspace.executeDiagnosticActionCommand` + provider refresh.
5. Dismiss click → `workspace.dismissDiagnostic(uri, d)` (fingerprint-based, in-memory store).
6. Typing a trigger char (from `getOnTypeTriggerCharacters()`) → `workspace.getOnTypeEdits(uri, pos, ch)` → apply (smart-quote autocorrect).

**Source modes:** (a) **Sample** — bundled USFM with seeded issues (default; works with no data dependencies); (b) **From chapter** — fetch source verses via the same endpoint the drafting loader uses (`GET /bibles/:bibleId/books/:bookId/chapters/:n/texts`), assemble USFM client-side with `usfm-assembly.ts`, then parse/check. Mode (b) is the "one canonical representation from real Fluent data" + "lint the export client-side" demonstration.

## 5. Known browser hazards and mitigations (findings for upstream)

`@sillsdev/lynx-usfm` has so far only been exercised in Node (VS Code extension; Scripture Forge uses the Delta factory, not USFM). Three concrete hazards, all worked around locally and all good upstream contributions:

1. **`UsfmStylesheet` construction is file-based.** The public constructor reads from disk (`fs.readFileSync`); `parseTagEntries(content)` exists but is `private` in the types. Mitigation: vendor `usfm.sty` (87 KB, from `@sillsdev/machine/dist/corpora/`, MIT) as a `?raw` Vite asset and call `parseTagEntries` through a narrow, commented cast. Upstream ask: a content-based constructor or factory.
2. **`@sillsdev/machine` corpora module-scope Node calls.** `usfm-stylesheet.mjs` computes `dirname(fileURLToPath(import.meta.url))` at module scope; the package's `browser` field stubs `fs`/`path`/`url` to empty modules, so this may throw on import depending on bundler interop. Mitigation if it bites: Vite aliases to a tiny shim. Verified empirically in §7.
3. **Locale JSONs load via template-literal dynamic `import()` inside published dists** (`createLocaleLoader`). Vite's dep optimizer may break the relative paths. Mitigation: `Localizer.addNamespace` is first-write-wins, so pre-register the five checker namespaces (`allowedCharacters`, `quotation`, `pairedPunctuation`, `punctuation-context`, `standardPunctuationFixes`) with static JSON imports before `workspace.init()`; and/or `optimizeDeps.exclude`.

Bundle notes: adds `rxjs` (^7.8) and a second `i18next` instance (core pins ^23, app has ^26 — separate instances by design, no conflict). Acceptable for a PoC; tree-shaking/size measurement is listed in the write-up.

## 6. UI

Two-column layout under the standard authenticated header, all shadcn components already in the repo (Card, Badge, Button, Select, Accordion, Tooltip, Separator):

- **Left: USFM editor** — monospace textarea with an aligned overlay rendering wavy underlines/tints per diagnostic severity; issue count chips; on-type smart quotes live.
- **Right, tab 1 "Checks"** — deliberately echoes the Repeated Word Check panel proposal: one accordion section per provider (Quotation, Allowed Characters, Paired Punctuation, Punctuation Context, Verse Order), findings **grouped by verse** with context snippets, severity badges, `[Fix: …]` buttons for actions with edits, `[Dismiss]` for fingerprinted diagnostics, zero state "No issues found".
- **Right, tab 2 "Structure"** — the typed node tree (type, range, preview) + a **formatted scripture preview** (chapter numbers, superscript verse numbers, paragraphs) rendered *purely from the parsed model* — the "front end understands verse structure natively" money shot.
- Source switcher (Sample / From chapter with bible/book/chapter inputs) in the page header.

## 7. Verification

- **Vitest (jsdom)**: stylesheet builds in a browser-like env with no `fs`; sample USFM parses to expected book/chapter/verse counts; seeded issues produce expected diagnostics per source; missing-verse quick fix round-trips (apply edit → diagnostic disappears); verses→USFM assembly matches the server's shape.
- **Live**: run the app against the local stack, drive the page (both source modes), screenshot; confirm no server round-trips during checking (network tab quiet after load).

## 8. Follow-on roadmap this PoC informs (detail in `lynx-fluent-assessment.md`)

1. Checks panel engine: back the proposed Checks tab with a `Workspace` instead of per-check bespoke hooks; `fingerprint` ↔ occurrence identity, `DiagnosticDismissalStore` ↔ editor-state/user_settings suppression cascade.
2. Greek Room / Wildebeest / spell check as `DiagnosticProvider`s calling the existing fluent-ai proxy.
3. Export linting: run `getDiagnostics` over assembled USFM before download (client) and/or in fluent-api tests.
4. Editor track: when Fluent picks a rich editor, keep the Lynx document as the shared model (Scripture Forge precedent: Quill + lynx-delta).
