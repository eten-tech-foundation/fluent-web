# Connectivity Profile Selector — Design

**Issue:** [eten-tech-foundation/fluent-web#280](https://github.com/eten-tech-foundation/fluent-web/issues/280)
**Date:** 2026-06-03
**Status:** Approved (pending spec review)
**Scope:** `fluent-web` only — no `fluent-api` / DB / `fluent-mobile` changes.

## Summary

Add an optional **Connectivity Profile** dropdown (with an info tooltip) to the Create Project
modal. Project managers pick one of three profiles at project creation; the choice is persisted
in the project's existing `metadata` JSON blob and later read by the Fluent mobile app to drive
its offline-download behavior. The profile is locked after creation — there is no post-creation
edit UI (out of scope).

## Background / Context

- The mobile companion app (`fluent-mobile`) is the downstream consumer. Its read-side is **not yet
  built** (tracked by `fluent-mobile` #39 "Build Prepare for Offline Screen"), so this ticket
  effectively **establishes the storage contract**.
- `fluent-mobile` #39 confirms the semantics from issue #280: three profiles drive the
  offline-prep trigger, and **"no connectivity profile set" is a distinct state** the mobile app
  explicitly checks for and treats as *Rarely Connected* behavior.
- Mobile is offline-first: it syncs projects from `fluent-api` into local SQLite (`syncAllData()`).
  The API's project response already includes the `metadata` field (`createSelectSchema(projects)`),
  so a value stored there is transmitted on the project record the mobile app syncs.
- The create-project flow already sends a `metadata` object in its payload, and the API persists it
  (`createProject` service spreads `...projectData` — including `metadata` — into
  `insert(projects).values(...)`). **Therefore storing the profile in `metadata` requires zero
  backend changes.**

### Why `metadata` (not a dedicated column)

Considered and rejected for this ticket: adding a `connectivity_profile` `pgEnum` column to the
`projects` table in `fluent-api`. That is the cleaner long-term model (typed, DB-validated), but it
expands a web-scoped ticket into a cross-repo migration + deploy, plus a mobile sync follow-up that
is required either way. The `metadata` approach ships #280 self-contained in the repo it was filed
against, with no migration risk, and is reversible. Decision recorded: **store in `metadata`.**

## Contract (for the mobile / API consumers)

| Aspect | Value |
| --- | --- |
| Storage location | `project.metadata.connectivityProfile` |
| Allowed values | `usually_connected`, `sometimes_connected`, `rarely_connected` (snake_case, matching existing API pgEnums) |
| Unset | Key is **omitted entirely** from `metadata`; consumers treat "absent" as the *Rarely Connected* default |

## Functional Requirements (from #280)

- Dropdown labeled **"Connectivity Profile"** on the project creation form.
- Three options, in this exact order: **Usually Connected**, **Sometimes Connected**, **Rarely Connected**.
- Placeholder text: **"Select profile"**.
- Info tooltip (`li:info`, the lucide `Info` icon) adjacent to the label, describing all three profiles:
  - **Usually Connected** — Resources load on demand when chapters open; no download preparation is required.
  - **Sometimes Connected** — The app silently caches assigned chapters in the background when WiFi is detected; assigned translators take no action.
  - **Rarely Connected** — The app prompts translators to prepare their device each time WiFi is detected before going offline.
- Field is **optional**; if left unset the project defaults to *Rarely Connected* behavior in the mobile app.

## Components & Changes

All changes are in `fluent-web`.

### 1. New constant module — `src/lib/constants/connectivityProfiles.ts`

Single source of truth for the enum and the ordered option list (mirrors the existing
`roles.ts` / `languages.ts` convention).

```ts
export type ConnectivityProfile =
  | 'usually_connected'
  | 'sometimes_connected'
  | 'rarely_connected';

// Ordered exactly as issue #280 requires: Usually, Sometimes, Rarely.
export const CONNECTIVITY_PROFILE_OPTIONS = [
  { value: 'usually_connected',   labelKey: 'connectivityUsuallyConnected',   descKey: 'connectivityTooltipUsually' },
  { value: 'sometimes_connected', labelKey: 'connectivitySometimesConnected', descKey: 'connectivityTooltipSometimes' },
  { value: 'rarely_connected',    labelKey: 'connectivityRarelyConnected',    descKey: 'connectivityTooltipRarely' },
] as const;
```

### 2. Pure mapping helper (testable)

To persist the choice without depending on a DOM testing library (`@testing-library/react` is not
installed), extract the metadata mapping into a pure function so it can be unit-tested with vitest:

```ts
// src/features/projects/lib/projectMetadata.ts
export function buildProjectMetadata(
  connectivityProfile: ConnectivityProfile | null | undefined
): Record<string, unknown> {
  return connectivityProfile ? { connectivityProfile } : {};
}
```

### 3. UI — `src/features/projects/components/CreateProjectModal.tsx`

- Add `connectivityProfile: ConnectivityProfile | null` to the internal `FormData` (init `null`;
  reset to `null` in the existing `isOpen` reset effect).
- Add `connectivityProfile?: ConnectivityProfile | null` to the exported `CreateProjectData`
  interface (optional).
- Render a new field block **last, after the Books field**, consisting of:
  - A `Label` **without** the red `*` (the field is optional), text from `t('connectivityProfile')`,
    with a lucide `Info` icon beside it. The icon is the `TooltipTrigger`; `TooltipContent` lists the
    three profile descriptions. Wrap in a local `<TooltipProvider delayDuration={300}>` — matching the
    convention in `AssignProjectUsers.tsx` (there is no global provider).
  - A shadcn `Select` with placeholder `t('connectivityProfilePlaceholder')` ("Select profile") and
    the three `SelectItem`s generated from `CONNECTIVITY_PROFILE_OPTIONS`.
- The field **must not** affect `isFormValid()` — submit stays enabled regardless of this field.
- Include `connectivityProfile: formData.connectivityProfile` in the `onSave({...})` payload.

### 4. Persistence mapping — `src/features/projects/components/index.tsx` (`handleSave`)

Replace the hard-coded `metadata: {}` with the helper:

```ts
metadata: buildProjectMetadata(projectData.connectivityProfile),
```

All other payload fields are unchanged. No change to `useProjects.ts` or the API call.

### 5. i18n — `public/locales/en/common.json` (+ `hi/common.json`)

Add keys:

| Key | English value |
| --- | --- |
| `connectivityProfile` | "Connectivity Profile" |
| `connectivityProfilePlaceholder` | "Select profile" |
| `connectivityUsuallyConnected` | "Usually Connected" |
| `connectivitySometimesConnected` | "Sometimes Connected" |
| `connectivityRarelyConnected` | "Rarely Connected" |
| `connectivityTooltipUsually` | "Usually Connected — Resources load on demand when chapters open; no download preparation is required." |
| `connectivityTooltipSometimes` | "Sometimes Connected — The app silently caches assigned chapters in the background when WiFi is detected; assigned translators take no action." |
| `connectivityTooltipRarely` | "Rarely Connected — The app prompts translators to prepare their device each time WiFi is detected before going offline." |

Hindi (`hi/common.json`) entries are added to preserve parity with `en` and **flagged for native
speaker review**; `fallbackLng: 'en'` covers any gap in the meantime.

## Testing

Follow TDD. The repo uses `vitest` (`pnpm test`) with a `jsdom` environment, but does **not** have
`@testing-library/react` installed and has no component-test culture (only `src/basic.test.ts`). To
avoid adding a dependency the ticket did not call for:

- Unit-test the pure `buildProjectMetadata` helper:
  - unset (`null` / `undefined`) → `{}` (key omitted)
  - each profile value → `{ connectivityProfile: <value> }`
- Optionally assert `CONNECTIVITY_PROFILE_OPTIONS` ordering matches the issue (Usually, Sometimes, Rarely).

## Verification

- `pnpm test` passes (new helper tests green).
- `pnpm typecheck` passes (new `ConnectivityProfile` type wired through `CreateProjectData`).
- `pnpm lint` / `pnpm format:check` pass.
- Manual: open Create Project modal → the dropdown renders last with placeholder "Select profile",
  the info tooltip shows all three descriptions, the field is optional (project creates with it
  unset), and a selected value lands in the POST body as `metadata.connectivityProfile`.

## Out of Scope

- `fluent-api` changes (no migration, no dedicated column).
- `fluent-mobile` read-side (#39) and the sync mapping for `metadata.connectivityProfile`.
- Any post-creation UI to view or change the profile (it is locked at creation).
