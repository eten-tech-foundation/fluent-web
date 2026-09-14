# AI suggestions in pericope view

Issue: https://github.com/eten-tech-foundation/fluent-web/issues/394

This change builds on the heading representation in
[web #475](https://github.com/eten-tech-foundation/fluent-web/pull/475) and
[API #320](https://github.com/eten-tech-foundation/fluent-api/pull/320).
The coordinated [API #326](https://github.com/eten-tech-foundation/fluent-api/pull/326)
and [AI worker #74](https://github.com/eten-tech-foundation/fluent-ai/pull/74) changes must
be available before enabling this web change.

## Loading and preservation

Both pericope surfaces populate every empty, untouched verse in the active group.
Saved and locally edited text remain unchanged. A single `queue-pericopes` request identifies
the active and next source-backed groups; the API resolves their verse ranges and queues
missing verse drafts and eligible titles. Suggestions for the next group are fetched into
the query cache, but are not inserted or logged until that group becomes active.

Fetching retries every five seconds while a requested verse or title is missing, up to
twelve retries in pericope view. The notice describes the whole active group. Moving the
caret within a group does not restart generation. Changing the assignment changes the
cache identity. Read-only and non-drafting surfaces do not queue or fetch suggestions.

Disabling AI cancels pending work on the client and stops new fills. Already displayed
content stays in the draft and continues through normal autosave. Enabling AI again requests
the active group and permits any currently empty input to receive a suggestion. During an
enabled session, manually clearing an input does not immediately refill it.

## Section titles

A group with a source title displays a separate Section title input. Its value is the first
heading in `markers.headings` on the group's first source-backed verse. Other headings and
paragraph markers are preserved. The rich text body omits that first heading while the input
is present, then restores it when passing scripture edits back to the save pipeline. This
keeps title words out of scripture text and avoids displaying the same title twice.

Only an empty, untouched title receives the generated suggestion. A group without a source
title requests no heading suggestion. The input uses the same 300-character, single-line
validation as the existing heading editor. Invalid input stays visible for correction and is
not saved. The API independently validates generated text and tracks the selected pericope
set, so an older set's in-flight result cannot become the current title.

When a verse suggestion and title arrive together, one draft update carries both. This
avoids competing updates to the first verse. Title edits use the existing debounced verse
save and preserve the current verse text.

## API contract and exposure

- `POST /ai-suggestions/queue-pericopes`: existing chapter/project identifiers plus
  `pericopeNumbers` containing the active and optional next group.
- `GET /ai-suggestions`: existing verse suggestions endpoint.
- `GET /ai-suggestions/pericopes`: chapter/project identifiers and CSV `pericopeNumbers`;
  returns `{data: [{pericopeNumber, bibleTextId, suggestedText, modelInfo?}]}`.
- `POST /ai-suggestions/usage`: each inserted verse is logged with `wasUsed: false` immediately.
- `POST /ai-suggestions/pericopes/usage`: same payload plus `pericopeNumber`, logging the
  title separately. Prefetch, existing authored text, and hidden groups create no exposure.

Verse mode retains its cursor-based `queue-next` workflow. The server's separate heading
jobs use `pericopeNumber` and `pericopeSetId`; the worker receives the source title and full
pericope context and returns a validated heading without generating scripture in that job.

## Validation

Automated coverage includes whole-group requests, delayed verses and titles, cache scoping,
read-only gating, preservation of saved text and author titles, combined first-verse/title
updates, title exposure, source gaps, and retaining headings through rich text edits.

Browser validation uses the real DraftingUI, drafting hooks and rich text editor against
controlled local API responses. It exercises late suggestions, saved and locally typed
content, title editing, pericope navigation, AI off/on, and autosave request payloads.
