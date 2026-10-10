# Standalone section headings

Fixes [web #432](https://github.com/eten-tech-foundation/fluent-web/issues/432).

Section Heading inserts a paragraph with its own words before the selected verse. It never
reformats scripture as a heading. The dialog collects nonempty text before insertion; existing
headings can be edited in the chapter and pericope surfaces. Clearing a heading removes it on save.
Heading level changes apply only to the selected heading. Body formats cannot convert a heading
back into verse text, and formatting a selection that spans paragraphs is refused.

The existing `markers.headings` array stores `{ marker, text }` entries in order before the
following verse. `paragraphs` and `headings` are independently optional. Heading words stay outside
`content`. Loading a verse with headings opens its stored body paragraph or a default `p`, so no
verse milestone appears in a heading. Legacy verse rows without headings keep their existing flow.

The converter separates heading prefixes from verse milestones even when imported USJ nests the
verse inside a heading. Character text in headings is flattened, as in the API contract. The UI
authors only `s1`–`s4`; `sd`/`sd1`–`sd4` are semantic dividers, not textual heading choices.

Both change detection and autosave deduplication include heading text, marker and order. Textarea
edits discard body offsets that no longer match the text, but preserve standalone headings. Direct
RTE edits are checked against the API's limits: four headings per verse, 300 characters per heading,
and no backslashes or line breaks. An invalid edit stays visible with an error and does not enter
autosave until corrected. Structural reloads and external fills are suspended while it is invalid.

Editorial 0.8.15 does not emit a change for a native level-only update to a heading with a single
text leaf. Fluent applies that paragraph attribute through `applyUpdate` with source `local`, which
reports the edit and records it in Editorial's native undo history. Scoped body formatting and
heading insertion use the same local-delta path. Text and existing embeds stay in the document,
and the selection is remapped without reloading the USJ. Document reloads remain for navigation
and external fills, not translator formatting actions.

Because nothing reloads, text typed right after a level change stays in the heading at its new
level. `applyUpdate` is marked EXPERIMENTAL in platform-editor 0.8.15. Whoever upgrades the editor
should recheck this call and the immediate-typing tests listed below.

## API dependency

Heading persistence requires the work from [API #320](https://github.com/eten-tech-foundation/fluent-api/pull/320),
which was integrated into [API #305](https://github.com/eten-tech-foundation/fluent-api/pull/305).
API #305 merged into main on October 2, 2026. Deployment of that API support must be verified
separately before enabling these web changes. No new endpoint or migration is introduced here.
Unsupported inline/apparatus preservation remains a separate [storage limitation](../rte-review-followup/review.md).

## Validation

Regression coverage checks heading/verse separation, ordered headings on empty verses, nested
heading/verse repair, poetry offsets, title-only edits and deletion, textarea preservation and
autosave. Component tests exercise insertion/cancel, invalid edit recovery and readonly behavior.
Real Editorial tests cover level persistence and refusal of selections crossing heading/verse blocks.
They also type immediately after switching a heading to `s2`, `s3` or `s4` and check that the saved
text keeps the new level, and they drive the H3/H4 toolbar buttons in ChapterEditor, type right
away, and check that the other headings and scripture are unchanged. A stylesheet test checks that
all four levels render differently in both editing surfaces.
Browser verification uses the production ChapterEditor and PericopeEditor with local save fixtures.
