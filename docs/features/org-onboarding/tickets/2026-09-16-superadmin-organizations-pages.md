# SuperAdmin Organizations pages: list, create org, invite first Org Manager

> **Status: IMPLEMENTED (local)** — on branch `feat/organization-onboarding`, awaiting review before push.
> GitHub: [fluent-web#492](https://github.com/eten-tech-foundation/fluent-web/issues/492)

**Parent feature:** [`org-onboarding`](../plan.md) — Ticket WEB-1.
**Repo:** `fluent-web`.
**Blocked by:** [fluent-api#336](https://github.com/eten-tech-foundation/fluent-api/issues/336) — `GET/POST /organizations`, `GET /organizations/{orgId}`, `GET /organizations/{orgId}/users`, `ORG_VIEW`/`ORG_CREATE` permissions, seeded `super_admin`.

## Problem

A new org and its first Org Manager can only be created by a developer. SuperAdmins need an Organizations area to list orgs, create one, and invite its first Org Manager by email; the system decides whether that email is a new Fluent user (magic-link invite) or an existing one (added to the org, login link). Once in, the Org Manager self-serves via the Users page (#489).

## Decisions

- Routes follow codebase convention: `/organizations`, `/organizations/$orgId`; dialogs via `?modal=create` / `?modal=add` (`modalSchema` already has both values). No `/orgs/new`.
- SuperAdmin lands on `/organizations` after login (today `isManager()` sends them to `/projects`).
- Invite reuses `POST /users/invite` with `roleName: 'Org Manager'`, `projectId: null`. The server branches on new vs existing account; the web words the toast from the HTTP status (201 new / 200 existing).
- Org list columns: **Name, Org Managers, Created**. No Members column; members are listed on the detail page.
- The zero-org solo workflow (auto-provisioned personal org on first project create) is untouched; it is the solo-user path and is refined in a later phase.

## Patterns to mirror

- List + modal wrapper: `src/features/projects/components/index.tsx` (`ProjectsWrapper`) and `src/routes/_authenticated/projects/index.tsx`.
- Detail: `ProjectDetailWrapper` + `src/routes/_authenticated/projects/$projectId/index.tsx`; header via `ViewPageHeader`.
- Invite-by-email form and inline duplicate check: `AssignProjectUsers.tsx:151-260` (`matchedExistingUser`, `ALREADY_EXISTS_MESSAGE`).
- Route guard + tests: `src/routes/_authenticated/users/index.tsx`, `route-guards.test.ts:130-150`.
- Table/loading/empty states: `src/features/users/components/ListUsers.tsx`.

## Tasks

### 1. SuperAdmin detection and auth context

Files: `src/lib/grant-utils.ts` (+ `grant-utils.test.ts`), `src/lib/router-context.ts`, `src/lib/router.ts`, `src/features/root/AppRouter.tsx`, `src/features/auth/route-guards.test.ts`

```ts
/** Global SuperAdmin grant: orgId == null && projectId == null && roleName === 'SuperAdmin'. */
export function isSuperAdmin(grants: UserGrant[] | undefined): boolean;
// AuthContext: canManageOrgs?: boolean
```

- [ ] Tests: true for a global SuperAdmin grant; false for an org-scoped grant even with `roleName === 'SuperAdmin'`; false for Org Manager. Uses all grants, not `getActiveGrants` (the global grant has `orgId === null`).
- [ ] Wire `canManageOrgs` through `AppRouter` (add to `router.invalidate()` deps) and the default context in `router.ts`.

### 2. Data hooks

Files: create `src/features/organizations/hooks/useOrganizations.ts` (+ `.test.tsx`); modify `src/hooks/useUsers.ts`, `src/lib/types.ts`

```ts
export interface Organization { id: number; name: string; createdAt: string | null }
export interface OrganizationSummary extends Organization { orgManagerCount: number }

useOrganizations()              GET /organizations              ['organizations']
useOrganization(orgId)          GET /organizations/:id          ['organizations', orgId]
useOrganizationUsers(orgId)     GET /organizations/:id/users    ['organizationUsers', orgId]
useCreateOrganization()         POST /organizations; invalidates ['organizations']

export interface InviteUserResult { user: User; created: boolean }  // created = HTTP 201
useCreateUser(): useMutation<InviteUserResult, Error, { userData: InviteUserPayload }>
```

- [ ] Add `apiRequestWithStatus<T>()` beside `apiRequest` in `useUsers.ts` returning `{ data, status }`; use it only for `createUser`.
- [ ] `useCreateUser.onSuccess`: when `projectId` is absent also invalidate `['organizationUsers', orgId]` and `['organizations']`.
- [ ] Existing consumers (`UsersWrapper.tsx`, `AssignProjectUsers.tsx`) ignore the return value — confirm with `pnpm typecheck`.
- [ ] Hook tests with mocked `fetch`: 409 on create → `An organization with this name already exists.`

### 3. Routes, nav, landing

Files: create `src/routes/_authenticated/organizations/index.tsx`, `src/routes/_authenticated/organizations/$orgId/index.tsx`; modify `MainMenu.tsx`, `src/features/header/components/index.tsx`, `RoleBasedHomePage.tsx`, `public/locales/{en,hi}/common.json`; tests in `header.test.tsx` / `MainMenu.test.tsx`, `RoleBasedHomePage.test.tsx`, `route-guards.test.ts`

- [ ] Both routes: `beforeLoad` redirects to `/` unless `context.auth.canManageOrgs`; `validateSearch` with `modal: modalSchema.optional()`. Regenerate `routeTree.gen.ts`.
- [ ] `MainMenu`: "Organizations" item (`Building2` icon) when `isSuperAdmin(userdetail?.grants)`; active on `pathname.startsWith('/organizations')`. Add `onOrganizationsClick` to the header.
- [ ] `RoleBasedHomePage`: `isSuperAdmin` → `<Navigate to='/organizations' />` before the `isManager` check.
- [ ] Tests: SuperAdmin sees the item and lands on `/organizations`; Org Manager sees no item and `/organizations` redirects.

### 4. Organizations list + Create Organization dialog

Create: `src/features/organizations/components/{OrganizationsWrapper,OrganizationsPage,CreateOrganizationModal}.tsx` + tests

- [ ] Page: `h1` Organizations; "Create Organization" → `?modal=create`. Table: Name, Org Managers, Created. Row click → `/organizations/$orgId`. Loading/empty states as `ListUsers`.
- [ ] Dialog: single required Name (trim, 1–100); submit disabled until valid / while pending; 409 → inline error under the field, dialog stays open with the typed value; success → toast, navigate to `/organizations/$orgId?modal=add`.
- [ ] Tests: disabled for empty/whitespace; 409 keeps value + shows error; success navigates with `modal: 'add'`.

### 5. Organization detail + Invite Org Manager dialog

Create: `src/features/organizations/components/{OrganizationDetailWrapper,OrganizationDetailPage,InviteOrgManagerModal}.tsx` + tests

- [ ] Header: org name, back link to `/organizations`, created date; "Invite Org Manager" → `?modal=add`.
- [ ] Members table from `useOrganizationUsers`: Name, Role (org-level role — use `getOrgRoleName` from the #489 plan; if #489 has not landed, add it here), Email, Status. Empty state: `No members yet — invite an Org Manager to get started.`
- [ ] Dialog: Email (required, zod, lower-cased), Display name (required); Role shown read-only as Org Manager. Duplicate guard against loaded members (any status): `This person is already in this organization.` + submit disabled. Submit → `createUserMutation.mutateAsync({ userData: { email, username, orgId, projectId: null, roleName: ROLES.ORG_MANAGER, orgName, inviterName } })`. Toast: 201 → `Invitation sent to {email}`; 200 → `{email} already has a Fluent account — they've been added as an Org Manager and sent a login link`. Failure keeps values + footer error. `?modal=add` on mount opens the dialog.
- [ ] Tests: duplicate → inline + disabled; 201 and 200 toasts (mock `sonner`); rejection keeps values; deep-link opens dialog.

### 6. Small fixes surfaced by the flow

- [ ] `OrgSwitcher.tsx:26-31` `ROLE_DISPLAY_ORDER` omits `ORG_MANAGER` (sorts after Org Member); add it at the front.

### 7. Manual QA (env with #336 deployed, seeded `super_admin`)

- [ ] SuperAdmin login → `/organizations`; nav shows Organizations.
- [ ] Create duplicate name → inline 409; unique name → toast + detail with invite dialog open.
- [ ] Invite new email → 201 toast, member `invited` / Org Manager, magic-link email.
- [ ] Invite existing Fluent user from another org → 200 toast, member `verified`, login-link email.
- [ ] Invite an existing member → inline error, disabled.
- [ ] New Org Manager via magic link → `/projects`, Users nav visible.
- [ ] Org Manager login → no Organizations nav; `/organizations` redirects to `/`.

## Verification

```
pnpm test src/lib/grant-utils.test.ts src/features/organizations src/components/RoleBasedHomePage.test.tsx src/features/auth/route-guards.test.ts
pnpm typecheck && pnpm lint
pnpm precheck   # final gate
```

## Out of scope

Rename/archive org; removing or re-roling an Org Manager from the detail page; any change to the zero-org solo workflow.
