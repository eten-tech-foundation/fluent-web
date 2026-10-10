# Code map

Where things live in `src/` and what each part calls. Setup and scripts are in the
[README](../README.md), and the rules the code relies on are in
[domain-rules.md](domain-rules.md).

## Outside this repo

- [fluent-api](https://github.com/eten-tech-foundation/fluent-api) is the only backend. Calls go to `${config.api.url}/<path>` with
  `credentials: 'include'`. There is no shared API client: each feature keeps its fetch functions
  and React Query hooks in its own `hooks/` folder. Sign-in goes through better-auth at
  `config.api.auth_url` (`src/lib/auth-client.ts`).
- The shared editor `@eten-tech-foundation/platform-editor` is only imported in
  `src/features/rte/`. `package.json` pins its exact version.
- Aquifer and YouVersion data comes through fluent-api's `/aquifer` and `/youversion` proxies.
  Only image and audio URLs inside Aquifer content load straight from a third party.
- Bible audio is looked up through fluent-api as well, but the player loads the file URLs it gets
  back: a recording plays from the provider's URL and generated speech from the URL that
  `POST /ai/tts/generate` returns.
- The repeated word check runs in [fluent-api](https://github.com/eten-tech-foundation/fluent-api), which hands it to [fluent-ai](https://github.com/eten-tech-foundation/fluent-ai).
- Errors and telemetry go through `Logger` (`src/lib/services/logger.ts`) to Application Insights
  (`src/lib/services/appInsights.ts`).

## App shell

- `src/main.tsx` creates the `QueryClient`, loads i18n and renders `AppRouter`.
- `src/routes/` holds the TanStack file routes. `_authenticated.tsx` guards everything under
  `src/routes/_authenticated/`, while `login`, `reset-password`, `accept-invitation` and `legal/`
  are public. `src/routeTree.gen.ts` is generated from these files.
- `src/features/root/`: `AppRouter.tsx` builds the router's `auth` context from the session and
  the stored user. The error boundary and the not-found page live here too.
- `src/features/auth/`: login, password reset and invitation pages, `AuthenticatedLayout.tsx`
  (loads the user and opens the settings and profile modals) and `return-to.ts`.
- `src/features/header/` and `src/components/header/`: the header, main menu, user menu and
  organization switcher. The header also shows the role change and presence banners.
- `src/components/RoleBasedHomePage.tsx` picks where a user lands: SuperAdmins go to
  `/organizations`, managers to `/projects`, observers and translators to their dashboards.

## Features

- `src/features/projects/`: the project list, project creation
  (`components/CreateProjectModal.tsx`, with the USFM import tab in
  `components/UsfmImportTab.tsx` and `lib/usfm-validate.ts`), the project page and the milestone
  page. The milestone page (`components/MilestoneDetailPage.tsx`) holds the chapter table, chapter
  assignment (`components/AssignUsersDialog.tsx`), book metadata
  (`components/EditProjectMetadataDialog.tsx`) and USFM export
  (`components/ExportProjectDialog.tsx`, a ZIP from `POST /project-units/:id/usfm`).
  `components/AssignProjectUsers.tsx` manages the project team. The feature calls `/projects`,
  `/projects/:id/...` (books, milestones, users, chapter assignments) and
  `/project-units/:id/book-details`.
- `src/features/dashboard/`: the translator dashboard (`user/UserHomePage.tsx`, with My Work and
  My History) and the observer dashboard (`observer/ObserverDashboard.tsx`). Both read
  `GET /users/:id/chapter-assignments` or the user's projects. `admin/index.tsx` isn't imported
  anywhere.
- `src/features/bible/`: the drafting page for one chapter assignment. `TranslationLoader.ts`
  loads it, `components/DraftingUI.tsx` runs it (saving, submit, AI fill, presence, the side
  panels) and `hooks/useDrafting.ts` with `hooks/useBibleTextDebounce.ts` save the verses. It calls
  `GET /bibles/:bibleId/books/:bookId/chapters/:n/texts`, `GET|POST /translated-verses`,
  `PATCH /chapter-assignments/:id/submit`, `POST|DELETE /chapter-assignments/:id/presence`,
  `GET|PUT /chapter-assignments/:id/editor-state` and the `/ai-suggestions` endpoints. The
  `/translation` and `/view` routes both render it, and `/view` is read only.
- `src/features/rte/`: the rich text editor built on platform-editor's `Editorial`, used by the
  chapter view and the pericope view. `lib/pericope-usj.ts` converts verse rows to USJ and back,
  and `styles/` holds the editor CSS and fonts.
- `src/features/pericopes/`: pericope boundaries for a chapter
  (`GET /projects/:projectId/pericopes/:bookCode/:chapter`) and the pericope sets offered when a
  project is created.
- `src/features/ai-translation/`: the AI switch in the settings modal and the toast that offers AI
  suggestions for a target language.
- `src/features/resources/`: the Resources tab on the drafting page. Translation notes, questions
  and words (TN, TQ, TW), study notes (OSN) and images come from Aquifer, and Bibles come from
  Aquifer and YouVersion (`hooks/useAquiferResources.ts`, `hooks/useYouVersion.ts`).
- `src/features/checks/`: the repeated word check on the drafting page. `hooks/useRepeatedWordsCheck.ts`
  calls `POST /ai/tools/greek-room/repeated-words`, `hooks/useSuppressions.ts` keeps the findings a
  translator dismissed (`GET|PUT /self/settings` and the chapter's editor state) and
  `components/ChecksPanel.tsx` shows the results. The runtime flag `repeatedWordCheck` turns it on.
- `src/features/tts/`: audio for the source and reference Bibles on the drafting page, with verse,
  pericope and chapter players and the Hide Audio setting. `resolver/` picks a recording or
  synthesized speech for each verse, and `resolver/licenceFence.ts` decides whether speech may be
  synthesized. It calls `GET /projects/:id/playback-audio/:bookCode/:chapter`,
  `GET /projects/:id/reference-audio/:bibleKey/:bookCode/:chapter`,
  `GET /projects/:id/bible-resources/:bibleKey` and `POST /ai/tts/generate`. The runtime flag
  `sourceAudio` turns it on, and `PlaybackRegistryProvider` in `src/routes/__root.tsx` lets only
  one player run at a time. The design is in `docs/features/audio-playback/design.md`.
- `src/features/organizations/`: the SuperAdmin organization pages and the Org Manager invite
  (`GET|POST /organizations`, `POST /users/invite`).
- `src/features/users/`: the Users page for the active organization. It changes org-level roles
  with `PATCH /organizations/:orgId/users/:userId` and profiles with `PATCH /users/:id`.
- `src/features/flags/`: runtime feature flags from `GET /config/features`, plus the `/debug`
  page, where a flag can be forced on or off in this browser (`flagOverrides.ts`).
  `FlagOverrideChip` stays on screen while an override is active.
- `src/features/profile/` and `src/features/legal/`: the profile editor and the static legal
  pages.

## Shared code

- `src/lib/`: `config.ts` (env validation and build-time flags), `types.ts` (API types, `ROLES`,
  chapter statuses), `grant-utils.ts` (role helpers), `auth-client.ts` and `services/`.
- `src/hooks/`: hooks more than one feature uses, such as `useAuth`, `useUsers` and
  `useChapterAssignment`.
- `src/store/store.ts`: the Zustand store. Part of it is persisted to localStorage.
- `src/components/`: shared modals, the role-based home page and `ui/`, the shadcn and Radix
  building blocks.
- `public/locales/`: translations (`en`, `hi`) in a single `common` namespace.
- `src/test/`: test setup, the MSW server and handlers, and `renderWithProviders`. Tests sit next
  to the code they cover as `*.test.ts` or `*.test.tsx`.

## Feature docs

`docs/features/` holds the proposals, designs and plans behind most features. Some status lines
there are out of date, so check the code before you rely on one. `docs/features/rte-poc/` and
`docs/features/lynx-client-usfm-poc/` describe proofs of concept whose code isn't on `main`, and
`docs/features/repeated-word-check/highlight-in-verse-suggestion.md` is a proposal that wasn't
built.
