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

Editorial 0.8.15 can miss a level-only update to a heading with a single text leaf: its delta fast
path does not always emit a paragraph-only change. Fluent calls `formatPara` on the selected heading
and then an empty local `applyUpdate([], 'local')`, which commits the pending format and
synchronizes the editor's USJ before the next keystroke. Fluent reports that USJ as the change. The
caret and undo history stay in the editor; there is no document reload and no delayed reselection.

An earlier version rewrote the heading's USJ paragraph, reloaded the document with `setUsj` and
restored the selection on a timer. That reload is asynchronous, so text typed right after a level
change could race with it and with the selection restore, rolling the heading back to its previous
level. `applyUpdate` is marked EXPERIMENTAL in platform-editor 0.8.15. Whoever upgrades the editor
should recheck this call and the immediate-typing tests listed below.

## API dependency

This web change requires [API #320](https://github.com/eten-tech-foundation/fluent-api/pull/320),
which completes heading preservation in import, chapter content and export. API #320 depends on
[API #305](https://github.com/eten-tech-foundation/fluent-api/pull/305). Both PRs are still open and
not deployed. Merge API #305, then API #320, and deploy the API support before enabling this web
change. No new endpoint or migration is needed. API and editor package changes are outside this PR.

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
