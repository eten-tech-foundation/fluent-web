# Cross-chapter pericopes: investigation #486

Investigated on 14 September 2026 for [fluent-web#486](https://github.com/eten-tech-foundation/fluent-web/issues/486). Web baseline: `aa82a6871906e75058e701bfe7ed54ae7d5aafa3`; API baseline: `0ebc0969cc0fc0b8e19055fd7caa664b4889d497`. Both matched GitHub `main` when inspected.

The reported split follows the current API and web data flow. Both bundled pericope sets define one group spanning **Mark 8:31–9:1**. For this group, the chapter 8 response contains only its eight verses, 8:31–38; the chapter 9 response contains only 9:1. The complete group is present in the source data, but the chapter endpoint filters it before the web receives it.

This investigation supplies a runnable reproduction and an implementation proposal. It does not change application behavior. The original report does not identify the project, source Bible, pericope set or deployed version; the reproduction uses synthetic text and current source code, not a production session.

## Evidence

| Layer                      | Finding                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pericope data              | FIA group `29b` and FCBH section `29`, pericope `2` (API identity `29_2`) both contain Mark 8:31–9:1. In both sets, the following group starts at 9:2.                                                                                                                                                                                                                                   |
| API query                  | The pericope repository queries rows for the selected set, book **and chapter**. Grouping happens after this filter, so the same group identity has eight rows in chapter 8 and one in chapter 9.                                                                                                                                                                                        |
| Web loading                | [TranslationLoader.ts](../../../src/features/bible/TranslationLoader.ts) fetches source and target texts for `projectItem.chapterNumber` only. [useChapterPericopes.ts](../../../src/features/pericopes/hooks/useChapterPericopes.ts) calls the chapter endpoint.                                                                                                                        |
| Group rendering            | [DraftingGridPericope.tsx](../../../src/features/bible/components/DraftingGridPericope.tsx) matches group references to source rows using only `verseNumber`. Its heading uses the active chapter. The resources-placeholder layout in [DraftingUI.tsx](../../../src/features/bible/components/DraftingUI.tsx) repeats this matching.                                                    |
| Draft state and navigation | [useDrafting.ts](../../../src/features/bible/hooks/useDrafting.ts), [usePericope.ts](../../../src/features/bible/hooks/usePericope.ts) and [pericope-navigation.ts](../../../src/features/bible/lib/pericope-navigation.ts) use chapter-local verse numbers for selection, reveal state, pending saves and navigation.                                                                   |
| Rich text                  | [PericopeRteGroup.tsx](../../../src/features/bible/components/PericopeRteGroup.tsx) supplies one chapter to the editor. [pericope-usj.ts](../../../src/features/rte/lib/pericope-usj.ts) writes one chapter marker and groups parsed text by verse number. [PericopeEditor.tsx](../../../src/features/rte/components/PericopeEditor.tsx) forwards `scrRef.verseNum` without its chapter. |
| Saving                     | `DraftingUI.saveVerse` resolves the source row by verse number, then posts its `bibleTextId` and the current `projectUnitId`. The API resolves the assignment for that source verse's actual chapter and applies that chapter's edit policy.                                                                                                                                             |

The API filtering is the first point where the full pericope becomes a fragment. Loading adjacent text alone cannot fix the missing group references; returning all group references alone cannot fix the chapter-local text and identity assumptions.

The API evidence is pinned to the inspected commit:

- Data rows: [FIA 8:31 through 9:1](https://github.com/eten-tech-foundation/fluent-api/blob/0ebc0969cc0fc0b8e19055fd7caa664b4889d497/data/FIA-All-Books.json#L82288) and [FCBH 8:31 through 9:1](https://github.com/eten-tech-foundation/fluent-api/blob/0ebc0969cc0fc0b8e19055fd7caa664b4889d497/data/FCBH-All-Books.json#L82421).
- Chapter filter: [repository](https://github.com/eten-tech-foundation/fluent-api/blob/0ebc0969cc0fc0b8e19055fd7caa664b4889d497/src/domains/pericopes/pericopes.repository.ts#L35), followed by [grouping](https://github.com/eten-tech-foundation/fluent-api/blob/0ebc0969cc0fc0b8e19055fd7caa664b4889d497/src/domains/pericopes/pericopes.service.ts#L34). The [route contract](https://github.com/eten-tech-foundation/fluent-api/blob/0ebc0969cc0fc0b8e19055fd7caa664b4889d497/src/domains/pericopes/pericopes.route.ts#L54) is explicitly chapter-scoped. Existing [tests](https://github.com/eten-tech-foundation/fluent-api/blob/0ebc0969cc0fc0b8e19055fd7caa664b4889d497/src/domains/pericopes/pericopes.test.ts#L238) mock the repository and cover single-chapter groups; they do not establish a product decision to split cross-chapter pericopes.
- Write identity and permissions: [upsert](https://github.com/eten-tech-foundation/fluent-api/blob/0ebc0969cc0fc0b8e19055fd7caa664b4889d497/src/domains/translated-verses/translated-verses.repository.ts#L108), [assignment resolution](https://github.com/eten-tech-foundation/fluent-api/blob/0ebc0969cc0fc0b8e19055fd7caa664b4889d497/src/domains/chapter-assignments/chapter-assignments.repository.ts#L162), and [chapter edit policy](https://github.com/eten-tech-foundation/fluent-api/blob/0ebc0969cc0fc0b8e19055fd7caa664b4889d497/src/domains/chapter-assignments/chapter-assignments.policy.ts#L37).

## Reproduction

The [diagnostic fixture](reproduction.tsx.txt) mounts the real `DraftingGridPericope` with synthetic source and target text. It does not mock that component or query a live API. The chapter-filtered fixtures correspond to the inspected repository query. It checks both the source card and the real textarea target path; it does not exercise the rich text editor or persistence.

From the repository root, using the pinned Node and pnpm versions in `package.json`:

```bash
pnpm install --frozen-lockfile
(
  set -eu
  fixture=$(mktemp src/test/issue486-reproduction-XXXXXX.test.tsx)
  trap 'rm -f -- "$fixture"' EXIT
  cp docs/features/cross-chapter-pericopes/reproduction.tsx.txt "$fixture"
  pnpm exec vitest run "$fixture" --maxWorkers=2
)
```

The diagnostic is deliberately outside the normal test suite. Its assertions describe the existing bug; a passing diagnostic means the bug was reproduced, not fixed. After implementation, replace these observations with regression tests requiring the complete pericope.

| Scenario                                              | Current behavior to reproduce                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Mark 8 with the chapter-filtered group           | Heading `8:31-38`; Mark 8:31–38 source and draft inputs appear; Mark 9:1 does not.                                                                    |
| Open Mark 9 with the chapter-filtered group           | Heading `9:1`; only Mark 9:1 source and draft input appear in this group.                                                                             |
| Return the full group but keep chapter 8 text loading | Mark **8:1** is incorrectly included because the reference to **9:1** matches the number `1`. The heading becomes `8:1-38`; Mark 9:1 is still absent. |

The third case is a counterfactual experiment, not a claim that production currently returns full groups. It shows why removing the API's chapter filter by itself would introduce a second bug.

## Intended behavior and remaining decisions

[Source display #275](https://github.com/eten-tech-foundation/fluent-web/issues/275) asks for all verses of a pericope in one block. [Drafting display #276](https://github.com/eten-tech-foundation/fluent-web/issues/276) asks for the full pericope as one visible work unit. These support displaying **Mark 8:31–9:1 together from either chapter**. Neither explicitly defines editing or navigation when a group crosses assignments.

The current assignment remains the authorization and workflow boundary. The API uses the adjacent chapter's actual assignment: a draft translator must own that chapter, a peer checker must be its checker, and later review stages have their own policy. An unassigned or unauthorized neighboring chapter cannot inherit permission from the chapter currently open.

[AI queuing #417](https://github.com/eten-tech-foundation/fluent-web/issues/417) explicitly keeps navigation-triggered queuing inside the current chapter. Full display must preserve that rule unless its requirements are changed separately.

Recommended behavior: show the complete readable pericope, with explicit chapter references, from either chapter. Resolve each verse's assignment before enabling editing; show any readable but non-editable neighboring text as context. Keep chapter progress and submission tied to the current assignment. Product still needs to settle whether editing an authorized neighboring chapter happens inside the same surface or requires opening that chapter, and where Next Pericope goes when it leaves the current assignment. These are proposal choices, not confirmed existing requirements.

## Implementation plan

1. **Add a full-group API contract.** Preserve the current chapter endpoint for existing consumers. Add an explicit option or endpoint that first finds group identities intersecting the selected chapter, then returns all their references in canonical order, scoped to the same project pericope set and book. Preserve FCBH's compound section/pericope identity. Test FIA and FCBH against 8:31–9:1 from both entry chapters, including the following group at 9:2.
2. **Load text and assignment context.** Fetch the chapters required by those references, not the whole Bible. Existing source and translated-text endpoints can supply each chapter; the source API also supports a bulk list of chapters. Target responses carry `bibleTextId` but omit `chapterNumber`, so join them to source rows by ID or preserve the chapter of each request. Preserve `bibleTextId`, chapter and verse in the web model, and associate target rows with that identity. Resolve readable/editable assignments separately. Handle absent adjacent chapters and failed loads explicitly rather than presenting an unlabeled partial group as complete.
3. **Use full references throughout the web.** Replace chapter-local numeric keys in grouping, selection, target state, debounce queues, navigation, AI maps and resource lookups. Use `bibleTextId` for persisted text identity and book/chapter/verse for references; include project/unit context in relevant cache keys. Order verses by chapter and verse. Render `8:31–9:1` and distinguish verse 1 in each chapter. Cover both normal and resources-placeholder layouts.
4. **Preserve chapter identity through editing.** Extend the RTE adapter and USJ round trip to retain chapter markers and full references, or compose chapter-specific editors inside a single pericope card. Apply the same identity and edit permissions to the textarea path. Save each verse with its own source ID and resolved assignment context. Flush pending edits before leaving the view; keep progress, submission, presence and resource state attached to the correct chapter.
5. **Validate interactions and roll out together.** Coordinate API support with web adoption. Account for the open section-heading [PR #475](https://github.com/eten-tech-foundation/fluent-web/pull/475) and pericope AI [PR #483](https://github.com/eten-tech-foundation/fluent-web/pull/483), which touch the same UI and identity paths. Neither covered this issue when inspected.

Acceptance coverage should require the same complete group from both chapters; correct source and target IDs after edit, autosave and reload; distinct same-number verses across chapters; rich text and textarea modes; mode switches with pending edits; both resource layouts; permissions and missing adjacent assignments; unchanged per-chapter progress/submission and AI queuing; and Next Pericope behavior at the chapter boundary. Include an ordinary within-chapter pericope as a control.

## Validation

The manual component diagnostic reproduced all three observations (3 scenarios passed). The existing web suite passed all 525 tests across 53 files. Lint, source formatting, typecheck, production build and the docs structure check passed. The build retains its large-chunk warning; the standard tests emit existing React/i18n and mocked-request warnings.

API conclusions were checked against the pinned source, canonical JSON and authenticated GitHub state. No live Fluent API request, database write, deployed-browser session or RTE persistence round trip was part of this investigation. The diagnostic is not a regression test for a completed fix.
