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

Editorial 0.8.15 does not emit a change for a level-only update to a heading with a single text leaf.
Fluent therefore rewrites that one USJ paragraph, reports the change explicitly, and restores the
selection after the editor reload. This uses the same document reload approach as scoped verse
formatting; it does not add a separate undo history for structural reloads.

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
Browser verification uses the production ChapterEditor and PericopeEditor with local save fixtures.
