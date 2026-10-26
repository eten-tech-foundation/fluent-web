# Domain rules and review checks

These are the rules the current code and tests rely on. Each one names the code that holds it and
a test that pins it, so a change can be checked against it. If a change has to break a rule, say
so in the PR and update this file in the same PR.

Two of them look like bugs but are intentional: role checks in the browser only shape the UI (see
[Permissions](#permissions)), and when two people edit the same chapter the last save wins (see
[Saving](#saving)).

## Permissions

[fluent-api](https://github.com/eten-tech-foundation/fluent-api) decides what a user may do. The browser uses roles only to choose what to show, so a
check here never replaces one in the API.

- Role checks compare the names in `ROLES` (`src/lib/types.ts`) through the helpers in
  `src/lib/grant-utils.ts`, such as `getActiveGrants`, `hasGrantForProject`, `isProjectManager`
  and `canViewUsers`. Role lists hard-coded there, like `ALLOW_PROJECT_MANAGER_TO_CREATE_PROJECT`,
  have to match what fluent-api allows. Tests: `src/lib/grant-utils.test.ts` › "is false for an
  org-scoped grant even when the role name is SuperAdmin"; `src/components/header/MainMenu.test.tsx`
  › "shows no Users item for a project-scoped Project Manager".
- Three routes have guards: `/users` checks `context.auth.canViewUsers` and `/organizations`
  checks `context.auth.canManageOrgs` (global SuperAdmin), both from
  `src/features/root/AppRouter.tsx`; `/audio/$bookId/$chapterNumber` redirects anyone who isn't a
  Project Manager on the project (the route loader, spec #383), and the drafting header's View
  Audio button only shows for PMs. Tests: `src/features/auth/route-guards.test.ts` › "redirects
  when user cannot view users"; `src/features/bible/components/DraftingHeader.test.tsx` ›
  "renders View Audio button when user is PM and audio exists". No test covers the audio route
  redirect itself.
- Part of chapter assignment is only checked in the browser. [fluent-api](https://github.com/eten-tech-foundation/fluent-api/blob/ce8cade6530329535b7ce4a1b248a66ac20b07d7/src/domains/projects/chapter-assignments/project-chapter-assignments.route.ts#L231-L298)'s `assign-selected`
  checks the permission, project access, organization membership and that the drafter and peer
  checker are different people. It doesn't check that both are Project Translators or that the
  chapter's status still allows the change. `src/features/projects/components/AssignUsersDialog.tsx`
  locks the drafter from peer check on and the peer checker from community review on, and
  `src/features/projects/components/MilestoneDetailPage.tsx` only enables Assign when the project
  has at least two translators. No test covers these.
- The Users page only manages org-level roles. A role change goes to
  `PATCH /organizations/:orgId/users/:userId`, a profile change to `PATCH /users/:id`, and nobody
  can change their own role. Tests: `src/features/users/components/UsersWrapper.test.tsx` ›
  "PATCHes the org-users role endpoint (not /users/:id) when only the role changes";
  `src/components/UserModal.test.tsx` › "disables the role dropdown for the current user (D2
  self-change)".
- Pages that need a session go under `src/routes/_authenticated/`. A `beforeLoad` does nothing
  while `context.auth.isLoading` is true, and every `returnTo` goes through `resolveReturnTo`
  (`src/features/auth/return-to.ts`), which only allows same-origin paths and never the login page.
  Tests: `src/features/auth/route-guards.test.ts` › "falls back to the app home for non-internal
  returnTo targets" and "never redirects back into the login page itself";
  `src/features/auth/LoginPage.test.tsx` › "ignores non-internal returnTo targets after sign-in".
- The session cookie is the only credential. API calls send `credentials: 'include'` and no keys
  or tokens, because every `VITE_*` value ends up in the bundle. Aquifer and YouVersion data comes
  through fluent-api's [`/aquifer`](https://github.com/eten-tech-foundation/fluent-api/tree/ce8cade6530329535b7ce4a1b248a66ac20b07d7/src/domains/aquifer-resources) and [`/youversion`](https://github.com/eten-tech-foundation/fluent-api/tree/ce8cade6530329535b7ce4a1b248a66ac20b07d7/src/domains/youversion) proxies. Tests:
  `src/features/resources/hooks/useYouVersion.test.ts` › "routes fetchYouVersionBibles through
  fluent-api proxy with credentials and no client API key header";
  `src/features/resources/hooks/useAquiferResources.test.ts` › "routes fetchAllLanguages through
  fluent-api with credentials".
- `useAppStore` (`src/store/store.ts`) persists `userdetail`, grants included, to localStorage,
  and logout doesn't clear it. Don't add anything sensitive to `partialize`. No test covers this.
- The CSP lives in `staticwebapp.config.json`. `connect-src` accepts any `https:` origin, but a
  new script, style, font or frame source needs an edit there. `pnpm build` rewrites the script
  hash from the inline script in `index.html` (`scripts/generate-csp.ts`), so commit the config
  when you change that script.

## Scripture text

The rich text editor only mounts when `config.features.rtePericope` is on (see
[Feature flags](#feature-flags)). The dev deploy turns it on and QA and production leave it off.

- `pericopeVersesToUsj` and `usjToPericopeVerses` in `src/features/rte/lib/pericope-usj.ts` must
  round-trip verse rows unchanged. Paragraph and poetry offsets point into the exact string that
  is saved, so a change to trimming or joining moves breaks around on reload and in the USFM
  export. Tests: `src/features/rte/lib/pericope-usj.test.ts` › "round-trips text and markers
  through the editor shape unchanged".
- Trim only the space USJ keeps before the next verse marker. Don't normalize text inside a verse.
  Tests: `src/features/rte/lib/pericope-usj.test.ts` › "drops the structural space USJ carries
  before the next verse marker".
- A verse number always starts its verse's text, because that is the only shape a verse row can
  store. So a paragraph break never lands between a number and its text
  (`src/features/rte/lib/verse-numbers.ts`): a break typed right after a number goes in front of
  it, with Shift or Alt held too, and Enter or Insert paragraph in a heading opens an empty
  paragraph under the last heading instead. Words typed in a line no verse owns yet, under a
  heading or above the first verse, bring the next verse's number to the start of that line
  first, and `usjToPericopeVerses` saves such words as the start of the next verse rather than
  dropping them. A typed letter (with Alt or AltGr too, which Windows reports as Ctrl+Alt, and
  one outside the BMP such as an Adlam letter) or a pasted line comes in with the number in one
  undo step. For an IME composition or a paste of several lines, the spaces that hold the caret
  after the number until words arrive are replaced by them, never left inside the verse. Tests:
  `src/features/rte/hooks/useVerseNumberKeys.test.tsx` › "brings the verse number in with the
  first letter", "brings the number in with a letter typed with %s, in one undo step", "brings
  the number in with a letter outside the BMP typed %s, in one undo step", "brings the number in
  with a pasted line, in one undo step", "leaves no caret host behind once a paste of several
  lines lands" and "moves the number down with its text on %s too";
  `src/features/rte/lib/pericope-usj.test.ts` › "starts the next verse with words typed in a new
  paragraph under a heading".
- Pericope View builds one document per pericope, but it must not add structure the chapter
  doesn't have. When a pericope's first verse opens no paragraph of its own, it continues the one
  the chapter has open there (`paragraphOpenBefore`, passed as `continuedParagraph`), so a Poetry
  line stays Poetry across the boxes, and editing that verse doesn't save a new paragraph. When
  the pericope before changes that paragraph, the open pericope follows it, once the translator
  isn't working in it. Tests:
  `src/features/rte/lib/pericope-usj.test.ts` › "does not save the continued paragraph as a break
  before the first verse"; `src/features/bible/components/PericopeRteGroup.test.tsx` › "tells the
  editor which paragraph the pericope continues"; `src/features/rte/components/PericopeEditor.test.tsx`
  › "shows the new paragraph and saves the first verse as continuing it" and "waits until the
  translator leaves the box before rebuilding it".
- A verse saves as plain text plus `markers.paragraphs` and `markers.headings`. Words inside
  character markers become plain verse text, and footnotes stay out of it. Tests:
  `src/features/rte/lib/pericope-usj.test.ts` › "leaves a footnote out of the verse row".
- `changedVerses` reports a verse the translator emptied as `{ text: '', markers: null }` instead
  of dropping it, and sends the full markers when only the markers changed (see the markers rule
  under [Saving](#saving)). Tests: `src/features/rte/lib/pericope-usj.test.ts` › "reports a verse
  emptied by the translator, rather than dropping it" and "reports a markers-only change so a new
  paragraph reaches the server".
- Headings follow fluent-api's [`verseMarkersSchema`](https://github.com/eten-tech-foundation/fluent-api/blob/ce8cade6530329535b7ce4a1b248a66ac20b07d7/src/db/schema.ts#L478): at most 4 per verse, 1 to 300 characters,
  no backslash or line break. `HEADING_MARKERS` in `src/features/rte/lib/heading-markers.ts`
  mirrors the API's `USFM_HEADING_MARKERS`, so change both repos together. While a heading is
  invalid the editor shows an error and doesn't save. Tests:
  `src/features/rte/components/ChapterEditor.test.tsx` › "keeps invalid heading edits visible and
  resumes saving after correction".
- The editor is uncontrolled. Don't feed new verses into it on every render. `ChapterEditor` and
  `PericopeEditor` reload it through `loadIntoEditor` only when the chapter or pericope changes,
  when an AI suggestion fills a verse the editor holds empty, after a structural rewrite, or when
  the pericope before changes the paragraph a pericope's first verse continues. That last reload
  waits until focus leaves the box, because a reload resets the caret and the undo history.
  Tests: `src/features/rte/components/ChapterEditor.test.tsx` › "does not report the editor mount
  echo as a change" and "does not write an AI suggestion away on the next edit".
- Some code works around bugs in Editorial 0.8.15. Keep it, and check it in a real browser when
  you upgrade `@eten-tech-foundation/platform-editor`: undo and redo shortcuts
  (`src/features/rte/lib/history-shortcuts.ts`), copy and paste
  (`src/features/rte/lib/editor-shortcuts.ts`, `src/features/rte/lib/editor-clipboard.ts`),
  heading level changes (`src/features/rte/lib/format-heading.ts`), formatting a single verse
  inside a longer block (`src/features/rte/lib/scoped-block-format.ts`), the space a new
  paragraph would start with, which Editorial drops so a later merge glues two words together
  (`afterWordSpace` in `src/features/rte/lib/verse-numbers.ts`), and the invisible caret host
  Editorial keeps after a lone verse number, which getUsj leaves out but deltas count
  (`src/features/rte/hooks/useVerseNumberKeys.ts`). Tests:
  `src/features/rte/lib/history-shortcuts.test.tsx`,
  `src/features/rte/lib/clipboard-shortcuts.test.tsx`,
  `src/features/rte/lib/format-heading.test.tsx`,
  `src/features/rte/lib/scoped-block-format.test.ts` and
  `src/features/rte/hooks/useVerseNumberKeys.test.tsx`.
- A project created from USFM sends the files as `usfmFiles` and `bookId: []`, and [fluent-api](https://github.com/eten-tech-foundation/fluent-api)
  takes the books from the files. The import tab (`src/features/projects/lib/usfm-validate.ts`) is
  all or nothing: one file that isn't USFM, has no book code or repeats a book clears the whole
  batch. Tests: `src/features/projects/components/CreateProjectModal.submit.test.tsx` › "drops a
  manual book selection when the submit carries usfm files";
  `src/features/projects/components/UsfmImportTab.test.tsx` › "imports nothing when one file of
  several is not USFM".
- Speech is synthesized only for a Bible whose `ttsLicenseStatus` is `allowed`. `forbidden`,
  `unknown` and a missing status all bar it, and `licenceBar` in
  `src/features/tts/resolver/licenceFence.ts` is the one place that reads the status. A barred
  Bible still plays its recording. Tests:
  `src/features/tts/hooks/useSourceTtsPlayback.licence.test.ts` › "never synthesizes a barred
  Bible, and says why instead of failing silently" and "refuses synthesis when no licence reached
  the page at all".

## Saving

The drafting page saves one verse at a time with `POST /translated-verses`
(`src/features/bible/hooks/useBibleTarget.ts`), through the queue in
`src/features/bible/hooks/useBibleTextDebounce.ts`.

- A verse saves 2 seconds after the last change. Changing verse, Next, Next Pericope and Submit
  save right away through `saveImmediately`, and Submit stops if a save fails. Leaving the page
  doesn't save: unmount clears the timers and there is no `beforeunload` handler. A new way out of
  the page has to save pending verses first. Tests: `src/features/bible/hooks/usePericope.test.ts`
  › "flushes a verse edited earlier in the pericope, not only the active one";
  `src/features/bible/hooks/useDrafting.test.ts` › "flushes the stored markers when the active
  verse changes, not a wipe".
- A failed save retries after 10 seconds with the latest text, and keeps retrying while the page
  is open. A 401, 403 or 404 sets `roleChangeWarning` instead: queued debounce and retry saves are
  cancelled (a save already in flight still completes), new ones are skipped and the header shows
  a banner. Tests:
  `src/features/bible/hooks/useBibleTextDebounce.test.ts` › "cancels pending saves and skips new
  saves when a 403 permission error occurs" and "retries a failed save with its markers intact".
- A save sends plain text and optional `markers`, never USJ. [fluent-api](https://github.com/eten-tech-foundation/fluent-api) replaces the stored
  markers with what the request carries and clears them when the field is missing, so every save
  path has to decide which markers to send. A textarea edit keeps the verse's headings and drops
  its paragraph offsets (`handleTextChange` in `src/features/bible/hooks/useDrafting.ts`). Tests:
  `src/features/bible/components/DraftingUI.test.tsx` › "maps markers into the upsert, omitting the
  field when the caller derived none"; `src/features/bible/hooks/useDrafting.test.ts` › "preserves
  standalone headings when editing verse text in the textarea".
- The page is read only on the `/view` route or for a project Observer
  (`src/features/bible/components/DraftingPage.tsx`). Chapter status doesn't lock the editor, so a
  new write has to check `readOnly`. Tests: `src/features/bible/hooks/useSyncGlobalAiSetting.test.ts`
  › "AI does not auto-enable on read-only /view/...".
- Saves carry no version, so when two people edit the same chapter the last save wins.
  `useChapterPresence` only warns the second editor, and only in the community review, linguist,
  theological and consultant check stages. No test covers the warning.
- Status changes happen in [fluent-api](https://github.com/eten-tech-foundation/fluent-api). The page only calls `PATCH /chapter-assignments/:id/submit`.
  Tests: `src/features/bible/components/DraftingUI.test.tsx` › "triggers submit workflow when
  translation is complete and submit button is clicked".
- A pericope that crosses into the next or previous chapter shows the other chapter's verses read
  only. Only verses of the current chapter are saved. Tests:
  `src/features/bible/components/CrossChapterPericope.test.tsx` › "keeps neighboring draft text
  read-only and sends changes only for the current chapter".
- The drafting route reads the assignment from navigation state (`projectItem`), not from the URL.
  `src/features/bible/TranslationLoader.ts` falls back to the stored `currentProjectItem` and
  otherwise redirects home. Tests: `src/features/bible/TranslationLoader.test.ts` › "redirects to
  the dashboard when no project item can be resolved".
- The book metadata dialog (`src/features/projects/components/EditProjectMetadataDialog.tsx`)
  saves each changed field on blur, sends an empty value as `null`, waits for the previous save of
  the same book, and saves what's pending when it closes or unmounts. Its inputs show only the
  stored `\toc1`, `\toc2` and `\toc3` values: the running header and book title (`\h`, `\mt`) are
  never shown or used to pre-fill one. Tests:
  `src/features/projects/components/EditProjectMetadataDialog.test.tsx` › "waits for an in-flight
  save before sending the next one for the same field" and "expands several books at once and
  shows the TOC values as stored".
- Word pairs a translator ignores everywhere in the repeated word check are saved with a
  full-replace `PUT /self/settings`. `src/features/checks/hooks/useSuppressions.ts` applies the
  change right away, sends the writes one at a time and rolls back on failure. Pairs ignored for
  one occurrence go through the chapter's editor state, which has a single writer. Tests:
  `src/features/checks/hooks/useSuppressions.test.ts` › "CR-15 follow-up: serializes overlapping
  global writes so PUTs reach the server in UI-action order".

## Async updates

- `useDrafting` seeds its `verses` once per assignment, and a refetch must not overwrite them while
  the page is open. Saves invalidate `['verse-text', { projectUnitId }]` so the next load is fresh.
  Tests: `src/features/bible/hooks/usePericopeContext.test.tsx` › "refreshes invalidated
  translations before initializing an assignment after a save".
- Query keys are inline arrays, so an invalidation has to match the root and the id type.
  `chapterAssignments`, `projectDetails` and `milestones` use a string project id while
  `projectUsers` uses a number, and `chapter-assignments` is a different key from
  `chapterAssignments`. No test catches a mismatch.
- Fetchers don't send the active organization, and switching organization only invalidates
  `['projects']`, `['user-projects']`, `['userChapterAssignments']` and `['users']`
  (`src/features/header/components/OrgSwitcher.tsx`). A new query whose data depends on the
  organization needs the org id in its key. No test covers this.
- Assigning chapters updates `['chapterAssignments', projectId]` right away and rolls back on
  error (`src/hooks/useChapterAssignment.ts`). Removing a project member or making them an
  Observer rewrites the cached assignments the way [fluent-api](https://github.com/eten-tech-foundation/fluent-api) does: their drafter slot clears in
  not started and draft, their peer checker slot also in peer check
  (`src/features/projects/hooks/useProjectUsers.ts`). If the API rule changes, change this too.
  Tests: `src/features/projects/components/AssignProjectUser.test.tsx` › "renders extended warning
  banner copy when member has active assignments".
- The repeated word check reruns after every successful save, because a counter that goes up
  after each save is part of its query key. It doesn't poll. The request and response types in
  `src/features/checks/checks.types.ts` are snake_case to match the AI-tools wire contract
  (the response is [fluent-ai](https://github.com/eten-tech-foundation/fluent-ai)'s envelope
  as-is), so don't rename them. The request sends the milestone's `project_unit_id`, not a project id: fluent-api works
  out the project and fills in fluent-ai's `project_id`/`project_name`
  ([fluent-api#420](https://github.com/eten-tech-foundation/fluent-api/issues/420)). Tests:
  `src/features/checks/hooks/useRepeatedWordsCheck.test.ts` › "re-runs the check when saveCounter
  changes" and "sends the project unit id, never the project id (#420 regression)".
- AI suggestions run only when AI is on, the chapter is in Draft and the page isn't read only. The
  page queues work (`queue-next` or `queue-pericopes`), then polls every 5 seconds, once for a verse
  and up to 12 times for a pericope (`src/features/bible/hooks/useAiSuggestions.ts`). Tests:
  `src/features/bible/hooks/useAiSuggestions.test.tsx` › "ignores a queue response from the
  previous assignment".
- A suggestion fills only a verse that is empty and that the translator hasn't touched
  (`src/features/bible/lib/ai-autofill.ts`), and then saves like typed text. Tests:
  `src/features/bible/components/DraftingUI.test.tsx` › "preserves a title being typed while a
  suggestion is in flight" and "does not accept later human text after clearing an AI-filled
  verse".

## Feature flags

- Runtime flags come from fluent-api's [`GET /config/features`](https://github.com/eten-tech-foundation/fluent-api/blob/ce8cade6530329535b7ce4a1b248a66ac20b07d7/src/routes/config.route.ts) and fail closed: a flag reads as
  off while loading, on error, or when the API doesn't list it. A new flag goes in `FeatureName`
  and `failClosedFeatures` (`src/features/flags/flags.types.ts`), matching fluent-api's [`FLAGS`](https://github.com/eten-tech-foundation/fluent-api/blob/ce8cade6530329535b7ce4a1b248a66ac20b07d7/src/lib/features.ts#L78).
  Use `useFeatureFlag` or `FeatureGate`, and also put the flag in the query's `enabled`, because
  `FeatureGate` only hides rendering. Tests: `src/features/flags/useFeatureFlags.test.tsx` › "fails
  closed (all flags off) when the endpoint errors".
- The `/debug` page can force a flag on or off in this browser. Overrides live in localStorage,
  never reach the API and work in every environment, production included. Only `useFeatureFlags`
  reads them (`src/features/flags/flagOverrides.ts`), and they reach queries as well as rendering,
  so the API still has to enforce whatever a flag guards. Tests:
  `src/features/flags/useFeatureFlags.test.tsx` › "reaches side effects, not just render: a gated
  query actually fires (O3)".
- Audio controls read `useAudioEnabled` (`src/features/tts/settings/useAudioEnabled.ts`), which
  combines the `sourceAudio` flag with the Hide Audio setting. A new audio control uses it instead
  of reading the flag. Tests: `src/features/bible/components/DraftingUI.ttsFlag.test.tsx` › "keeps
  the controls hidden when the API publishes the flag off".
- Build-time flags (`VITE_RTE_PERICOPE`, `VITE_USFM_IMPORT`) are read through
  `config.features` in `src/lib/config.ts`. Vite inlines them, so each deploy is its own build
  (`.github/workflows/deploy.yml`). Tests pin them off in `vite.config.ts`, and a suite that needs
  one turns it on through `config.features`, not through the env.
