# RTE PoC — SharedEditor in fluent-web (issue #375)

**Status:** PoC (exploratory; decides the editor library, not production code).
**Code:** stays on the reference branch `poc/rte-shared-editor` (stacked on `poc/lynx-client-usfm`, [PR #327](https://github.com/eten-tech-foundation/fluent-web/pull/327), to reuse the Lynx machinery); only this design doc lands on `main`.
**Approved:** 2026-07-17 (design discussed and approved in session; order: SharedEditor first, ProseMirror counterpart after on the same harness).

## Goal

Roadmap step 3 for the Rich Text Editor: a working pericope-view editing PoC inside fluent-web for the primary candidate, demonstrating the five things the R&D spikes could not — real in-app integration, pericope-scoped editing, the on-demand format bar, the USJ save path, and Lynx check highlights — so the team can make the final editor decision against the ProseMirror counterpart.

## Decisions

1. **Editor:** `@eten-tech-foundation/platform-editor` 0.8.x from npm, `Editorial` component (Marginal is deprecated). `EditorRef` provides `setAnnotation`/`removeAnnotation` for check highlights. React ≥18.3.1 peer matches fluent-web; yjs peer not needed on the Editorial path.
2. **USJ on the client:** a minimal, deterministic USFM→USJ converter covering only the curated V1 subset our assembled USFM contains (`\id \h \mt \c \p \v`). The canonical converter decision is explicitly out of scope (issue #375); this keeps the PoC honest and dependency-free. The reverse — USJ→verse texts — is a small tree walk used by the save path.
3. **Pericope scoping:** boundaries come from the existing `useChapterPericopes` hook (`{pericopeNumber, pericopeTitle, verses[]}`). The page slices the chapter USJ down to the selected pericope's verses, the editor edits only the slice, and saving merges the slice back into the chapter USJ. Fallback when a chapter has no pericope data: the whole chapter behaves as one pericope.
4. **Save path (PoC shape of the R&D §4 dual-write):** `onUsjChange` → merge slice into chapter USJ → derive per-verse texts → live "derived verse rows" panel proves verse-mode compatibility. Actual `POST /translated-verses` is a deliberate opt-in button, not automatic.
5. **Format bar:** no permanent toolbar (requirements constraint). A minimal floating bar toggled by keyboard (and auto-hidden), carrying only undo/redo and paragraph-break insertion; structural actions stay keyboard-first.
6. **Lynx highlights:** reuse the existing `src/features/lynx` workspace (from PR #327). New mapper turns Lynx diagnostics (line/char over the assembled USFM) into `AnnotationRange` (USJ jsonPath + offset) — the spike-3 bridge promoted to app code — applied via `editorRef.setAnnotation`.

## Architecture

```text
src/features/rte/
  lib/
    usfm-to-usj.ts        # curated-subset USFM → USJ (deterministic)
    usj-verses.ts         # USJ → per-verse texts (save-path derivation)
    pericope-slice.ts     # slice chapter USJ by verse list + merge back
    lynx-annotations.ts   # Lynx diagnostics → AnnotationRange[]
  hooks/
    useRtePoc.ts          # page state: chapter USJ, slice, dirty state, derived verses
  components/
    RtePocPage.tsx        # route shell: source controls, pericope selector, panels
    RteEditor.tsx         # Editorial wrapper (ref, usj in/out, annotations, format bar)
    FormatBar.tsx         # on-demand floating bar
    DerivedVersesPanel.tsx
src/routes/_authenticated/rte-poc.tsx
```

Data flow: verses (seed sample or bible-texts endpoint) → assemble USFM (existing lynx lib) → `usfmToUsj` → chapter USJ → `slicePericope` → Editorial → `onUsjChange` → `mergePericope` → `usjToVerses` → derived panel (+ optional POST). Lynx runs on the assembled USFM of the current chapter state; diagnostics map to annotations on the slice.

## Testing

TDD on the four lib modules (vitest, colocated): golden USFM→USJ conversion incl. multi-paragraph verses; verse extraction round-trip (verses → USFM → USJ → verses is identity); slice/merge identity and edit-merge; annotation mapping incl. out-of-slice diagnostics dropped. UI verified live in the browser (screenshots), matching the Lynx PoC precedent.

## Comparison harness (for the ProseMirror increment)

The page keeps editor-specific code behind `RteEditor` so the ProseMirror counterpart swaps that component only; both share lib/hooks/panels, making the step-3 comparison apples-to-apples. Measurements (chapter load, typing latency, annotation apply) run CPU-throttled via DevTools on both, appended to the R&D doc scorecard.

## Known limitations

Behaviours a production version must close, recorded from the working PoC rather than inferred.

- **The converter drops what it does not know.** `usfmToUsj` handles `\id \h \mt \c \p \v` plus plain continuation lines; any other marker is silently omitted, and malformed lines fall through as text. That is safe _only_ because its input is USFM this app assembled from verse rows moments earlier, never imported or user-authored USFM. Point it at real Paratext USFM and content disappears without a trace. Before it feeds anything that gets saved, it needs to fail closed on unknown markers (reject, or preserve them verbatim) and carry fixtures per supported marker plus one unsupported-marker case.
- **The pericope fallback cannot distinguish "no pericopes" from "not loaded yet".** The whole-chapter fallback triggers whenever `useChapterPericopes` has no data — which is also true while the query is disabled (no project id), pending, or errored. A user whose pericope fetch fails silently gets a whole-chapter editor that looks deliberate. Production should branch on query state and treat only a settled empty result as "this chapter has none".
- **The save contract is PoC-shaped.** The opt-in button posts changed verses one `POST /translated-verses` per row, sequentially, skipping rows whose `bibleTextId` is unknown and reporting saved/skipped counts. There is no batching, no retry, no optimistic state, and nothing prevents a second click from re-posting rows already in flight. A real dual-write needs the batch-vs-single decision made explicitly, plus duplicate-submit and partial-failure handling.
- **The format bar is keyboard-first by requirement, which costs discoverability.** No permanent toolbar was allowed, so the bar is toggled by keyboard and auto-hides. As built that leaves pointer, touch and assistive-technology users without a route to it. Shipping this shape needs a focusable trigger with an accessible name, `aria-expanded`/`aria-controls`, the bar staying visible while it or its trigger holds focus, and Escape to dismiss.

## Out of scope

Formatted view, section headings, footnote UI, verse-bridge UI, the `chapter_documents` storage PR, converter canonicalization, real-time collab.
