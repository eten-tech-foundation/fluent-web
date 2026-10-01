# Org Onboarding — Web Implementation Plan

**Goal:** A SuperAdmin can see all organizations, create a new one, and invite its first Org Manager by email — the system decides whether that email is a new Fluent user (magic-link invite) or an existing one (added to the org, login link sent). Once in, the Org Manager self-serves further managers via the Users page (#489).

**Companion plan (API side):** `fluent-api/docs/features/org-onboarding/plan.md` (tickets API-1, API-2)
**Downstream plan:** `docs/features/org-manager-users-page/plan.md` (#489)

**Tech Stack:** React 18, TanStack Router (file routes, `?modal=` search params) + Query, Vitest + Testing Library, react-i18next, shadcn/ui

**Depends on:** fluent-api ticket API-1 deployed to the target environment.

---

## Decisions (agreed 2026-09-16)

- Routes follow the codebase convention: `/organizations` and `/organizations/$orgId`, dialogs opened via `?modal=create` / `?modal=add`. No `/orgs/new`.
- SuperAdmin lands on `/organizations` after login (today `isManager()` sends them to `/projects`).
- Invite reuses `POST /users/invite` with `roleName: 'Org Manager'`, `projectId: null`. The server already branches on new vs. existing account; the web only needs to word the result (201 vs 200).

## Current state (audited)

- SuperAdmin is recognised on the web only inside `MANAGER_ROLES` / `ROLES_WITH_USER_VIEW` string lists in `src/lib/grant-utils.ts`; there is no `isSuperAdmin` helper and no `AuthContext` flag for it (`src/lib/router-context.ts`).
- `RoleBasedHomePage` routes any manager (incl. SuperAdmin) to `/projects`.
- `MainMenu` shows Dashboard / Projects / Users; no Organizations entry.
- Invite-by-email UX to mirror: the `invite` tab in `src/features/projects/components/AssignProjectUsers.tsx:151-260` (email + display name, inline duplicate check against the loaded list, `ALREADY_EXISTS_MESSAGE` mapping, `createUserMutation` from `useUsers`).
- List + modal wrapper pattern to mirror: `src/features/projects/components/index.tsx` (`ProjectsWrapper`) and `src/routes/_authenticated/projects/index.tsx`; detail pattern: `ProjectDetailWrapper` + `src/routes/_authenticated/projects/$projectId/index.tsx`.
- `modalSchema` (`src/lib/modal-schema.ts`) already contains `create` and `add` — no new values needed.
- `useUsers.ts:createUser` discards the HTTP status, so the caller cannot tell 200 from 201 today.

---

## Ticket WEB-1: SuperAdmin Organizations pages + Invite Org Manager

### Task 1: SuperAdmin detection and auth context

**Files:**

- Modify: `src/lib/grant-utils.ts`, create/extend `src/lib/grant-utils.test.ts`
- Modify: `src/lib/router-context.ts`, `src/lib/router.ts`, `src/features/root/AppRouter.tsx`
- Modify: `src/features/auth/route-guards.test.ts`

**Interface:**

```ts
// grant-utils.ts
/** Global SuperAdmin grant: orgId == null && projectId == null && roleName === 'SuperAdmin'. */
export function isSuperAdmin(grants: UserGrant[] | undefined): boolean

// router-context.ts
export interface AuthContext { …; /** Global SuperAdmin — can list/create orgs */ canManageOrgs?: boolean }
```

- [ ] Failing tests: `isSuperAdmin` true for a global SuperAdmin grant; false for an org-scoped grant even if `roleName === 'SuperAdmin'`; false for Org Manager.
- [ ] Wire `canManageOrgs: isSuperAdmin(userdetail?.grants)` through `AppRouter` (add to the `router.invalidate()` deps) and the default context in `router.ts`.
- [ ] Route-guard test for `/organizations` (see Task 3) alongside the existing `/users` cases at `route-guards.test.ts:130-150`.

Note: `isSuperAdmin` uses **all** grants, not `getActiveGrants`, because the global grant has `orgId === null` and applies regardless of the active org.

### Task 2: Data hooks

**Files:**

- Create: `src/features/organizations/hooks/useOrganizations.ts`, `useOrganizations.test.tsx`
- Modify: `src/hooks/useUsers.ts`
- Modify: `src/lib/types.ts`

**Interface:**

```ts
// types.ts
export interface Organization { id: number; name: string; createdAt: string | null }
export interface OrganizationSummary extends Organization { orgManagerCount: number }

// useOrganizations.ts  (mirror fetch/`credentials: 'include'` style of useProjects.ts)
export const useOrganizations = (enabled = true)            // GET /organizations       → ['organizations']
export const useOrganization = (orgId: number)             // GET /organizations/:id   → ['organizations', orgId]
export const useOrganizationUsers = (orgId: number)        // GET /organizations/:id/users → ['organizationUsers', orgId]
export const useCreateOrganization = ()                    // POST /organizations; invalidates ['organizations']

// useUsers.ts — createUser returns the status so callers can word the outcome
export interface InviteUserResult { user: User; created: boolean }   // created = HTTP 201
export const useCreateUser = () => useMutation<InviteUserResult, Error, { userData: InviteUserPayload }>(…)
```

- [ ] `apiRequest` in `useUsers.ts` needs to expose the status for this one call: add a sibling `apiRequestWithStatus<T>()` returning `{ data, status }` rather than changing every caller.
- [ ] `useCreateUser.onSuccess`: when `userData.projectId` is absent also invalidate `['organizationUsers', userData.orgId]` and `['organizations']` (counts change).
- [ ] Update the two existing consumers of `createUserMutation.mutateAsync` (`UsersWrapper.tsx`, `AssignProjectUsers.tsx`) — they ignore the return value, so this is type-only; confirm with `pnpm typecheck`.
- [ ] Hook tests with a mocked `fetch`: 409 on create → error message `An organization with this name already exists.` (map from the API's conflict message the same way `knownErrors` does today).

### Task 3: Routes, nav, landing

**Files:**

- Create: `src/routes/_authenticated/organizations/index.tsx`, `src/routes/_authenticated/organizations/$orgId/index.tsx`
- Modify: `src/components/header/MainMenu.tsx`, `src/features/header/components/index.tsx` (add `onOrganizationsClick`), `src/components/RoleBasedHomePage.tsx`
- Modify/create tests: `header.test.tsx` or `MainMenu.test.tsx`, `RoleBasedHomePage.test.tsx`
- Modify: `public/locales/en/common.json`, `public/locales/hi/common.json` (`organizations`, `createOrganization`, `inviteOrgManager`, …)

- [ ] Both routes: `beforeLoad` throws `redirect({ to: '/' })` unless `context.auth.canManageOrgs`; `validateSearch` with `modal: modalSchema.optional()` (index) and `modal` + nothing else (detail). Regenerate `routeTree.gen.ts` by running the dev server or the router CLI once.
- [ ] `MainMenu`: add an Organizations item (`Building2` icon, already used by `OrgSwitcher`) rendered when `isSuperAdmin(userdetail?.grants)`; `isActive` when `pathname.startsWith('/organizations')`.
- [ ] `RoleBasedHomePage`: before the `isManager` check, `if (isSuperAdmin(userdetail.grants)) return <Navigate to='/organizations' />`.
- [ ] Tests: SuperAdmin sees Organizations + lands on `/organizations`; Org Manager sees no Organizations item and `/organizations` redirects.

### Task 4: Organizations list page + Create Organization dialog

**Files (create):**

- `src/features/organizations/components/OrganizationsWrapper.tsx`
- `src/features/organizations/components/OrganizationsPage.tsx`
- `src/features/organizations/components/CreateOrganizationModal.tsx`
- `src/features/organizations/components/CreateOrganizationModal.test.tsx`
- `src/features/organizations/components/OrganizationsWrapper.test.tsx`

**Behaviour:**

- Page: `h1` "Organizations", primary button "Create Organization" → `navigate({ to: '/organizations', search: { modal: 'create' } })`. Table columns: Name, Org Managers, Created (no Members column — members are listed on the detail page). Rows click through to `/organizations/$orgId`. Loading and empty states as in `ListUsers.tsx`.
- Dialog (mirror `UserModal` structure): single required field Name (trim, 1–100). Submit disabled until valid or while pending. On 409 show inline error under the field and keep the dialog open. On success: close dialog, toast `Organization created`, navigate to `/organizations/$orgId?modal=add` so the invite dialog opens immediately (the "from there, invite an org manager" step).

- [ ] Failing tests: button disabled for empty/whitespace name; 409 keeps dialog open with the typed name and shows the error; success navigates to the detail route with `modal: 'add'`.
- [ ] Implement, following `ProjectsWrapper` for wiring and `CreateProjectModal` for form conventions.

### Task 5: Organization detail page + Invite Org Manager dialog

**Files (create):**

- `src/features/organizations/components/OrganizationDetailWrapper.tsx`
- `src/features/organizations/components/OrganizationDetailPage.tsx`
- `src/features/organizations/components/InviteOrgManagerModal.tsx`
- `src/features/organizations/components/InviteOrgManagerModal.test.tsx`
- `src/features/organizations/components/OrganizationDetailWrapper.test.tsx`

**Behaviour:**

- Header: org name, back link to `/organizations` (`ViewPageHeader` pattern), created date. Primary button "Invite Org Manager" → `?modal=add`.
- Members table from `useOrganizationUsers(orgId)`: Name, Role (org-level role via the `getOrgRoleName` helper defined in the #489 plan — if #489 has not landed, add it here and #489 reuses it), Email, Status badge. Empty state: `No members yet — invite an Org Manager to get started.`
- Invite dialog fields: Email (required, zod email, lower-cased), Display name (required). Role is fixed to Org Manager and shown as read-only text, not a dropdown.
  - Inline duplicate guard against the loaded member list (any status): `This person is already in this organization.` and submit disabled — same approach as `matchedExistingUser` in `AssignProjectUsers.tsx:152-156`.
  - Submit → `createUserMutation.mutateAsync({ userData: { email, username, orgId, projectId: null, roleName: ROLES.ORG_MANAGER, orgName, inviterName } })`.
  - Success toast wording from `created`: `Invitation sent to {email}` (201) vs `{email} already has a Fluent account — they've been added as an Org Manager and sent a login link` (200). Close dialog; list refreshes via invalidation.
  - Failure: keep dialog open with values, footer error as in `UserModal`.
- Deep-linking `/organizations/$orgId?modal=add` (from Task 4) opens the dialog on mount.

- [ ] Failing tests: duplicate email → inline message + disabled; successful 201 and 200 produce the two different toasts (mock `sonner`); rejection keeps values; `?modal=add` on mount opens the dialog.
- [ ] Implement.

### Task 6: Org Manager first-login sanity (no code expected)

- [ ] New user: magic link → `/accept-invitation` → set password → `RoleBasedHomePage` → `/projects` (empty, "Create Project" available), nav shows Users. Confirm `OrgSwitcher` shows the role sensibly: `ROLE_DISPLAY_ORDER` (`OrgSwitcher.tsx:26-31`) omits `ORG_MANAGER`, so it sorts after Org Member — add `ROLES.ORG_MANAGER` at the front of that list.
- [ ] Existing user in another org: login → switch org in `OrgSwitcher` → same as above.

### Task 7: Manual QA script (env with API-1 deployed, seeded `super_admin`)

- [ ] Log in as SuperAdmin → lands on `/organizations`; nav shows Organizations.
- [ ] Create org with a duplicate name → inline 409 error, dialog stays open. Create with a unique name → toast, redirected to detail with the invite dialog open.
- [ ] Invite a brand-new email → 201 toast; member appears as `invited` / Org Manager; email received with magic link.
- [ ] Invite an email that already has a Fluent account in another org → 200 toast; member appears as `verified`; login-link email received.
- [ ] Invite an email already in this org → inline error, button disabled.
- [ ] Log in as the new Org Manager via the magic link → lands on `/projects`, sees Users nav.
- [ ] Log in as an Org Manager → no Organizations nav; `/organizations` redirects to `/`.

---

## Verification summary

| Scope      | Command                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| focused    | `pnpm test src/lib/grant-utils.test.ts src/features/organizations src/components/RoleBasedHomePage.test.tsx src/features/auth/route-guards.test.ts` |
| types/lint | `pnpm typecheck && pnpm lint`                                                                                                                       |
| final gate | `pnpm precheck`                                                                                                                                     |

## Follow-ups (not in WEB-1)

- Rename / archive organization (needs API `PATCH`/`DELETE /organizations/{orgId}`).
- Let a SuperAdmin remove or change an Org Manager from the detail page (reuse `DELETE /organizations/{orgId}/users/{userId}` and the API-2 role endpoint).
- The zero-org "solo workflow" auto-provisioning in `POST /projects` stays — it is the path for a solo user who registers, logs in and works without an admin. It will be refined in a later phase; nothing in WEB-1 touches it.
