# Org Manager Users Page Implementation Plan

**Goal:** Let an Org Manager open the existing Users page and add / edit other users with org-scoped roles (Org Manager, Project Manager), so an org can have more than one manager without engineering creating accounts.

**Spec:** https://github.com/eten-tech-foundation/fluent-web/issues/489

**Repos:** `fluent-api` (prerequisite), `fluent-web`

**Tech Stack:** Hono + Drizzle + Vitest (api); React 18, TanStack Router/Query, Vitest + Testing Library, react-i18next (web)

---

## Findings from codebase audit (state as of 2026-09-16)

The ticket describes the current state slightly differently from what is in the code. These are the facts the plan is built on.

### Already done in fluent-web

| Requirement                                  | Status                                                                                                                                                                         | Where                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| "Users" nav visible only to Org Manager      | **Done** in #352. `canViewUsers` accepts `Org Manager`, `Org Owner`, `SuperAdmin` only.                                                                                        | `src/lib/grant-utils.ts:63-70`, `src/components/header/MainMenu.tsx:35`, `src/routes/_authenticated/users/index.tsx` (route guard) |
| Org Manager lands on `/projects` after login | **Done.** `isManager()` includes `Org Manager`.                                                                                                                                | `src/components/RoleBasedHomePage.tsx:28`                                                                                          |
| Role read-only on own row                    | **Done.** `disableRoleSelection={userdetail?.email === selectedUser?.email}`                                                                                                   | `src/features/users/components/UsersWrapper.tsx:128`                                                                               |
| Add failure keeps dialog open with values    | **Mostly done.** `handleClose()` runs only on success; form state lives in `UserModal` and survives. Error is rendered in the footer. Needs a test and a review of error copy. | `UsersWrapper.tsx:56-111`, `UserModal.tsx:219-225`                                                                                 |
| Role dropdown                                | Currently offers **Project Manager + Translator** (not only Translator, as the ticket says).                                                                                   | `src/lib/constants/roles.ts`                                                                                                       |

### Blocked on fluent-api — these make the ticket un-shippable as frontend-only work

1. **An Org Manager cannot assign the Org Manager role.** `canAssignRole()` requires `ROLE_ASSIGN_ORG_MANAGER` for target role `Org Manager`, and the RBAC seed only gives that permission to SuperAdmin (`src/db/seeds/rbac.ts:29-41`, `src/lib/services/permissions/authorize.ts:68-71`). `POST /users/invite` with `roleName: 'Org Manager'` from an Org Manager returns **403**.
2. **"Project Manager" is a project-pinned role in the API; there is no org-scoped PM.** `canAssignRole()` returns `false` for PM when `projectId === null` (`authorize.ts:82-90`). The Users page has no project, so inviting a PM from it returns **403**. `grant-utils.ts` header comment and `projects.route.ts:90-94` (TEMP bypass) both document PM as project-pinned.
3. **Editing a role does nothing.** `PATCH /users/:id` uses `updateUserRequestSchema`, which has no `role` field (zod strips it), and `users.repository.update()` strips `role` again. The Edit User dialog "succeeds" without changing anything. The only role-change endpoint is `PATCH /projects/{projectId}/users/{userId}` — project-scoped. There is **no org-level role-change endpoint**.
4. No dev-seed Org Manager account exists (`src/db/seeds/dev-users.ts` seeds PM + translators only), so nothing above can be exercised locally or in QA today.

### Things that already work in our favour

- `GET /users` is org-scoped for non-SuperAdmins and returns `orgGrants` filtered to the caller's orgs (`users.service.ts:getUsersForUser`). The client-side duplicate-email check can be done purely against the already-loaded list.
- `POST /users/invite` already handles the "existing Fluent account, new to this org" path (adds anchor + role grant, sends login-link email) and returns 409 for true duplicates.
- Every invited user gets an `Org Member` anchor grant _plus_ the real role grant, so `orgGrants` for a user typically contains two rows.

---

## Decisions (resolved by Product 2026-09-16)

**D1 → Option B: org-level roles only.** The OM invite brings a user into the org with a member grant; project roles are set per project once it exists. The Users page offers `Org Manager` (promote) and `Org Member` (demote — removes the org-level role while keeping membership + project grants). A PM can be promoted to OM; an OM+PM demoted stays PM. **A3 was dropped.**

**D2 → Self-change block is the guard.** An OM cannot change their own role — only another OM can demote them, which guarantees ≥1 OM always remains. Self-removal via `DELETE` is blocked for the same reason (and the remove action is hidden on the caller's row).

**D3 → Role column precedence (top wins):** no role → `Organization Member`; org-level role; else project roles in order `Project Manager` → `Translator` → `Observer`.

**New scope:** an OM can remove a user from the org entirely — confirm banner warns "Their chapter assignments will be removed." when the target holds assignments (mirrors `AssignProjectUsers`).

---

## Phase A — fluent-api

### Task A1: Let Org Managers assign the Org Manager role

**Files:**

- Modify: `src/db/seeds/rbac.ts`
- Modify: `src/lib/services/permissions/authorize.test.ts`

**Steps:**

- [ ] Add `{ roleName: ROLES.ORG_MANAGER, permissionName: PERMISSIONS.ROLE_ASSIGN_ORG_MANAGER }` to `ROLE_PERMISSION_MAP` in the Org Manager block.
- [ ] Add an `authorize.test.ts` case: caller with an org-scoped grant carrying `ROLE_ASSIGN_ORG_MANAGER` → `canAssignRole(caller, ROLES.ORG_MANAGER, ORG, null)` is `true`; same caller cannot assign `SuperAdmin`.
- [ ] Deploy note in the PR: `seedRbac()` is idempotent (`onConflictDoNothing`) and runs from `src/db/scripts/setup.ts`; QA/prod need `pnpm db:seed:rbac` (or the setup script) re-run after deploy so existing Org Manager rows pick up the permission.

Verify: `pnpm test src/lib/services/permissions/authorize.test.ts`, `pnpm typecheck`.

### Task A2: Org-level role-change endpoint

Mirror the existing `PATCH /projects/{projectId}/users/{userId}` route.

**Files:**

- Modify: `src/domains/organizations/users/org-users.route.ts`
- Modify: `src/domains/organizations/users/org-users.repository.ts`
- Create: `src/domains/organizations/users/org-users.service.ts`
- Create: `src/domains/organizations/users/org-users.service.test.ts`
- Modify: `src/domains/organizations/users/org-users.types.ts` (create if absent)

**Interface:**

```
PATCH /organizations/{orgId}/users/{userId}
body: { roleName: 'Org Manager' | 'Project Manager' }   // PM only if D1 = Option A
200: UserResponse (with orgGrants refreshed)
400: unknown / non-org role name
403: caller lacks canAssignRole(caller, roleName, orgId, null), OR caller === target (self-change blocked, same as project route)
404: target user not a member of orgId
```

**Steps:**

- [ ] Write failing service tests: (a) self-change → FORBIDDEN, (b) target not in org → USER_NOT_FOUND, (c) replaces the existing org-level non-anchor grant and keeps the `Org Member` anchor and any project-scoped grants, (d) idempotent when the role is unchanged.
- [ ] Service `updateOrgUserRole(callerId, orgId, userId, roleName)`: resolve `roleId` via `getRoleId`; in one transaction delete `user_roles` rows for `(userId, orgId, projectId IS NULL)` whose role is not `Org Member`, then insert the new grant; return `usersService.getUserById(userId)`.
- [ ] Route: middleware `authenticateUser`, `requireUserAccess(USER_ACTIONS.UPDATE, 'userId')`; in the handler call `canAssignRole(caller, roleName, orgId, null)` and 403 on false. Validate body with `z.object({ roleName: z.enum([...]) })` built from the allowed org roles.
- [ ] Also add a unit test for `canAssignRole` under the scope `{ orgId, projectId: null }` for each allowed role so A1 and A3 stay honest.

Verify: `pnpm test src/domains/organizations`, `pnpm typecheck`, `pnpm lint`.

### Task A3 (D1 = Option A only): Org-level Project Manager grant

**Files:**

- Modify: `src/lib/services/permissions/authorize.ts`
- Modify: `src/lib/services/permissions/authorize.test.ts`
- Modify: `src/domains/projects/projects.route.ts` (revisit the TEMP bypass comment — an org-level PM grant now satisfies the normal `authorize()` path; keep the bypass for legacy project-pinned PMs or remove it in a follow-up)

**Steps:**

- [ ] In `canAssignRole`, branch 4: when `targetRoleName === ROLES.PROJECT_MANAGER && projectId === null`, require `authorize(caller, PERMISSIONS.ROLE_ASSIGN_PROJECT, { orgId, projectId: null })`. Translator/Observer stay project-only.
- [ ] Tests: Org Manager can assign org-level PM; a project-pinned PM cannot (their `ROLE_ASSIGN_PROJECT` grant is project-pinned and `isGrantApplicable` rejects it for org scope); Translator/Observer at org scope still `false`.
- [ ] Confirm `getUsersForUser` / `findRoleGrantsByUserIds` need no change (they already return `projectId: null` rows).

If D1 = Option B: skip this task and restrict A2's `roleName` enum to `Org Manager`.

### Task A4: Dev seed Org Manager

**Files:**

- Modify: `src/db/seeds/dev-users.ts`

- [ ] Add an `org_manager` seed user with an org-scoped `Org Manager` grant (+ `Org Member` anchor) in the dev org, following the existing PM pattern. This is what QA and local dev use for the whole feature.

---

## Phase B — fluent-web

**Implemented on `feat/org-manager-self-service`** (stacked on `feat/organization-onboarding`; not pushed). Depends on A1 + A2 being merged and deployed to the environment you test against.

What shipped vs the tasks below: `ORG_ROLE_OPTIONS` landed in `constants/roles.ts` as `[Org Member, Org Manager]` for edit plus `ORG_INVITE_ROLE_OPTIONS` (OM only — invite already creates the anchor, so inviting "as member" would double-grant). `getOrgRoleName` implements the D3 order (org role → PM > Translator > Observer → `Org Member`); a new `getOrgLevelRoleName` drives the edit dropdown's initial value. Edit saves go to `PATCH /organizations/:orgId/users/:userId` via `useUpdateOrgUserRole`; `onSave` rethrows so the modal reverts the dropdown on failure. New scope: per-row remove action + `RemoveOrgUserBanner` + `useRemoveOrgUser` (DELETE org-user) with the assignment warning.

### Task W1: Org-scoped role options and role display

**Files:**

- Modify: `src/lib/constants/roles.ts`
- Modify: `src/lib/types.ts` (add `ORG_ROLE_OPTIONS`)
- Modify: `src/components/UserModal.tsx`
- Modify: `src/features/users/components/ListUsers.tsx`
- Create: `src/lib/grant-utils.test.ts` (or extend if present)
- Modify: `src/lib/grant-utils.ts`

**Interface:**

```ts
// types.ts
export const ORG_ROLE_OPTIONS: RoleOption[] = ROLE_OPTIONS.filter(r =>
  ([ROLES.ORG_MANAGER, ROLES.PROJECT_MANAGER] as readonly string[]).includes(r.value)
); // drop PROJECT_MANAGER if D1 = Option B

// grant-utils.ts
/** The org-level role shown on the Users page (D3). */
export function getOrgRoleName(
  orgGrants: UserGrant[] | undefined,
  orgId: number | null | undefined
): string | undefined;
```

**Steps:**

- [ ] Failing tests for `getOrgRoleName`: prefers `projectId == null && roleName !== 'Org Member'`; falls back to first project-role; `undefined` when only the anchor exists.
- [ ] Replace `roleOptions` usage in `UserModal` with `ORG_ROLE_OPTIONS`. Delete `roleOptions` from `roles.ts` if nothing else imports it (grep first — `getRoleLabel` uses it; switch it to `getDisplayRole`).
- [ ] `ListUsers.tsx:135`: render `getDisplayRole(getOrgRoleName(user.orgGrants ?? user.grants, activeOrgId) ?? 'No Role')`. Pass `activeOrgId` from `UsersWrapper` (`userdetail.lastActiveOrgId`).
- [ ] `UserModal` edit-mode initial role: use the same `getOrgRoleName` helper instead of the current `find(g => g.orgId === lastActiveOrgId)` (which can land on the `Org Member` anchor).

Verify: `pnpm test src/lib/grant-utils.test.ts`, `pnpm typecheck`.

### Task W2: Duplicate-email guard in Add User

**Files:**

- Modify: `src/components/UserModal.tsx`
- Modify: `src/features/users/components/UsersWrapper.tsx`
- Create: `src/components/UserModal.test.tsx`
- Modify: `public/locales/en/common.json`, `public/locales/hi/common.json`

**Interface:** new prop `existingEmails?: ReadonlySet<string>` (lower-cased) on `UserModal`. `UsersWrapper` builds it with `useMemo` from `users`.

**Steps:**

- [ ] Failing test: render `UserModal` in `create` mode with `existingEmails = new Set(['ann@x.org'])`, type `Ann@X.org`, expect text `This person is already in your organization.` and the `Add User` button disabled; type a different email → error gone, button enabled once other required fields are valid.
- [ ] Implement: `const isDuplicate = mode === 'create' && existingEmails?.has(formData.email.trim().toLowerCase())`; render the message under the email input (not the footer — footer is for submit errors); fold `!isDuplicate` into `isFormValid()`.
- [ ] Add i18n key `userAlreadyInOrg` to both locale files. Both `invited` and `verified` users are in the list, so "active or pending" is covered.

Verify: `pnpm test src/components/UserModal.test.tsx`.

### Task W3: Add User failure keeps dialog open (test + copy)

**Files:**

- Modify: `src/components/UserModal.test.tsx`
- Modify: `src/features/users/components/UsersWrapper.tsx` (only if the test reveals a gap)

**Steps:**

- [ ] Test: `onSave` rejects → dialog still open, all field values intact, footer shows the error message, button re-enabled.
- [ ] Review `useUsers.ts:createUser` error mapping: unknown server errors become `Error: User was not created.`; network failures (`fetch` throws `TypeError`) also fall into that branch. Confirm the message is acceptable inline copy or route both to an i18n key `addUserFailed`.

### Task W4: Edit User — save role via the org endpoint, revert on failure

**Files:**

- Modify: `src/hooks/useUsers.ts`
- Modify: `src/features/users/components/UsersWrapper.tsx`
- Modify: `src/components/UserModal.tsx`
- Modify: `src/components/UserModal.test.tsx`
- Create: `src/features/users/components/UsersWrapper.test.tsx`

**Interface:**

```ts
// useUsers.ts
export const useUpdateOrgUserRole = () =>
  useMutation({
    mutationFn: ({
      orgId,
      userId,
      roleName,
    }: {
      orgId: number;
      userId: number;
      roleName: string;
    }) =>
      apiRequest<User>(`${config.api.url}/organizations/${orgId}/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ roleName }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

// UserModal: onSave now REJECTS on failure (wrapper rethrows after setting userError).
// On rejection in edit mode the modal resets `role` to the initially loaded role.
```

**Steps:**

- [ ] Failing `UserModal` test: edit mode, initial role `Project Manager`, user picks `Org Manager`, `onSave` rejects → dropdown shows `Project Manager` again, error text visible, dialog still open.
- [ ] Failing `UsersWrapper` test (mock `useUsers`, `useUpdateUser`, `useUpdateOrgUserRole`): saving an edit where only the role changed calls the org-role mutation and not `PATCH /users/:id`; where only the username changed calls only `updateUser`; where both changed calls both (profile first, then role).
- [ ] Implement in `handleSaveUser` edit branch: diff `userData` against `selectedUser`; call `updateUserMutation` for profile fields (`username`, `firstName`, `lastName`) only if any changed; call `updateOrgUserRole` if `role` differs from `getOrgRoleName(selectedUser...)`. Keep the existing `setUserDetail` sync when editing self (role cannot change on self, so only profile fields matter there).
- [ ] Change `handleSaveUser` to `throw error` after `setUserError(...)`; in `UserModal.handleSubmit` catch, `if (mode === 'edit') setFormData(prev => ({ ...prev, role: initialRole }))`. Remove the duplicate `Logger.logException` in `UserModal` (the wrapper already logs).
- [ ] Keep `disableRoleSelection` as-is for the self-row (already satisfies the ticket).

Verify: `pnpm test src/components/UserModal.test.tsx src/features/users/components/UsersWrapper.test.tsx`, `pnpm typecheck`.

### Task W5: Regression tests for nav + landing (no production change expected)

**Files:**

- Modify: `src/features/header/components/header.test.tsx` (or a new `MainMenu.test.tsx`)
- Create: `src/components/RoleBasedHomePage.test.tsx`

**Steps:**

- [ ] `MainMenu`: Org Manager grant → `Users` item rendered; Project Manager grant → not rendered; Org Member only → neither `Projects` nor `Users`.
- [ ] `RoleBasedHomePage`: Org Manager → navigates to `/projects`.
- [ ] Route guard already covered by `route-guards.test.ts:136-145`; no change.

### Task W6: Manual QA pass (against an env with Phase A deployed)

- [ ] Log in as the seeded Org Manager → lands on Projects; menu shows Dashboard, Projects, Users.
- [ ] Add User with role Org Manager (new email) → 201, row appears with role `Org Manager`, invite email sent.
- [ ] Add User with an email already in the list (one `invited`, one `verified`) → inline error, button disabled.
- [ ] Add User with an email that exists in Fluent but not this org → succeeds (existing-user path).
- [ ] Kill the API / use devtools offline → Add fails, dialog stays open with values, error shown.
- [ ] Edit another user's role PM ↔ Org Manager → table updates; they see the Users nav on next load.
- [ ] Edit own row → Role disabled.
- [ ] Force the role PATCH to 500 → dropdown reverts, error shown, dialog open.
- [ ] Log in as a Project Manager → no Users nav; `/users` redirects to `/`.

---

## Verification summary

| Repo       | Command                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| fluent-api | `pnpm test src/lib/services/permissions src/domains/organizations && pnpm typecheck && pnpm lint`                           |
| fluent-web | `pnpm test src/components/UserModal.test.tsx src/features/users src/lib/grant-utils.test.ts && pnpm typecheck && pnpm lint` |
| final gate | `pnpm precheck` in fluent-web                                                                                               |

## Suggested ticket split

1. **fluent-api:** "Org Manager can assign Org Manager; add PATCH /organizations/{orgId}/users/{userId} role endpoint; seed dev Org Manager" (A1, A2, A4; A3 if D1 = A).
2. **fluent-web #489:** W1–W6, blocked on (1). Update #489's description to note nav/landing/self-row are already in place and the dropdown currently has PM + Translator.
