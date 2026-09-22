# Users page: Org Manager / Project Manager roles in Add and Edit User

> **Status: NOT STARTED** — awaiting go-ahead to implement, fluent-api#337, and Product decisions D1–D3.
> GitHub: [fluent-web#489](https://github.com/eten-tech-foundation/fluent-web/issues/489) (Product ticket)

**Parent feature:** [`org-manager-users-page`](../plan.md) — Phase B. Cross-repo context: [`org-onboarding`](../../org-onboarding/plan.md).
**Repo:** `fluent-web`.
**Blocked by:** [fluent-api#337](https://github.com/eten-tech-foundation/fluent-api/issues/337) — Org Manager may assign Org Manager; `PATCH /organizations/{orgId}/users/{userId}`. QA also needs the seeded `org_manager` from fluent-api#336.
**Sequencing:** fluent-api#336 → fluent-web#492 → fluent-api#337 → this.

## Problem

An Org Manager should be able to add and edit other users with org-scoped roles from the existing Users page. Parts of #489 are already in place; the rest depends on API work and three Product decisions.

### Already done (regression tests only)

| Requirement                                  | Where                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| Users nav visible only to Org Manager (#352) | `grant-utils.ts:63-70`, `MainMenu.tsx:35`, `routes/_authenticated/users/index.tsx` |
| Org Manager lands on `/projects`             | `RoleBasedHomePage.tsx:28`                                                         |
| Role read-only on own row                    | `UsersWrapper.tsx:128`                                                             |
| Add failure keeps dialog open with values    | `UsersWrapper.tsx:56-111`, `UserModal.tsx:219-225`                                 |

The Role dropdown currently offers Project Manager **and** Translator (`src/lib/constants/roles.ts`), not Translator only as #489 states.

### Not possible until fluent-api#337

Org Manager inviting an Org Manager → 403; Edit role → silent no-op (`PATCH /users/:id` ignores `role`); no org-scoped Project Manager in the API.

## Product decisions (open)

- **D1** — "Project Manager" on the org Users page: (a) org-level PM grant in the API, or (b) Org Manager only in the dropdown. Determines `ORG_ROLE_OPTIONS` below.
- **D2** — Ship without a last-Org-Manager guard (as #489's note suggests). Assumed yes.
- **D3** — Role column when a user holds an org role plus project roles. Proposed: org-level role (`projectId == null`, not `Org Member`), then first project role, then `No Role`. Today the column often shows the `Org Member` anchor.

## Tasks

### W1. Org-scoped role options and role display

Files: `src/lib/types.ts`, `src/lib/constants/roles.ts`, `src/lib/grant-utils.ts` (+ test), `src/components/UserModal.tsx`, `src/features/users/components/ListUsers.tsx`, `UsersWrapper.tsx`

```ts
export const ORG_ROLE_OPTIONS: RoleOption[] = ROLE_OPTIONS.filter(r =>
  ([ROLES.ORG_MANAGER, ROLES.PROJECT_MANAGER] as readonly string[]).includes(r.value)
); // drop PM under D1 (b)

export function getOrgRoleName(
  orgGrants: UserGrant[] | undefined,
  orgId: number | null | undefined
): string | undefined;
```

- [ ] Tests for `getOrgRoleName` (D3 rules).
- [ ] `UserModal` uses `ORG_ROLE_OPTIONS`; `roleOptions` removed from `roles.ts` (`getRoleLabel` → `getDisplayRole`).
- [ ] `ListUsers.tsx:135` renders `getDisplayRole(getOrgRoleName(...) ?? 'No Role')`; `UsersWrapper` passes `activeOrgId`.
- [ ] `UserModal` edit-mode initial role uses `getOrgRoleName` (current lookup can land on the anchor).

### W2. Duplicate-email guard in Add User

Files: `UserModal.tsx` (+ new `UserModal.test.tsx`), `UsersWrapper.tsx`, `public/locales/{en,hi}/common.json`

- [ ] New prop `existingEmails?: ReadonlySet<string>` (lower-cased), built in `UsersWrapper` from `users`.
- [ ] Test: `Ann@X.org` vs existing `ann@x.org` → `This person is already in your organization.` under the email field, button disabled; different email → cleared.
- [ ] `isDuplicate` folded into `isFormValid()`; i18n key `userAlreadyInOrg`.

### W3. Add failure keeps dialog open — test + copy

- [ ] Test: `onSave` rejects → dialog open, values intact, footer error, button re-enabled.
- [ ] Review `useUsers.ts:createUser` fallback `Error: User was not created.` (also hit on network `TypeError`); keep or move to i18n `addUserFailed`.

### W4. Edit User — save role via org endpoint, revert on failure

Files: `src/hooks/useUsers.ts`, `UsersWrapper.tsx` (+ new `UsersWrapper.test.tsx`), `UserModal.tsx` (+ test)

```ts
useUpdateOrgUserRole(): mutation({ orgId, userId, roleName }) → PATCH /organizations/:orgId/users/:userId; invalidates ['users']
// UserModal.onSave now REJECTS on failure (wrapper rethrows after setUserError). Edit mode resets role to initial on rejection.
```

- [ ] `UserModal` test: initial PM → pick Org Manager → `onSave` rejects → dropdown shows PM, error visible, dialog open.
- [ ] `UsersWrapper` test (mock hooks): role-only change → org-role mutation only; username-only → `updateUser` only; both → profile first, then role.
- [ ] `handleSaveUser` edit branch diffs against `selectedUser`; keeps `setUserDetail` self-sync for profile fields; rethrows after `setUserError`.
- [ ] `UserModal.handleSubmit` catch: revert role in edit mode; drop the duplicate `Logger.logException` (wrapper logs).
- [ ] `disableRoleSelection` for self-row unchanged.

### W5. Regression tests (no production change expected)

- [ ] `MainMenu`: Org Manager → Users item; Project Manager → none; Org Member only → neither Projects nor Users.
- [ ] `RoleBasedHomePage`: Org Manager → `/projects`.

### W6. Manual QA (env with fluent-api#337 deployed, seeded `org_manager`)

- [ ] Org Manager login → Projects; menu shows Dashboard, Projects, Users.
- [ ] Add Org Manager (new email) → row appears, invite email sent.
- [ ] Add duplicate email (`invited` and `verified` cases) → inline error, disabled.
- [ ] Add email existing in Fluent but not this org → existing-user path succeeds.
- [ ] Offline → Add fails, dialog open with values, error shown.
- [ ] Edit another user PM ↔ Org Manager → table updates; they see Users nav on next load.
- [ ] Own row → Role disabled. Force role PATCH 500 → dropdown reverts, error shown.
- [ ] Project Manager login → no Users nav; `/users` → `/`.

## Verification

```
pnpm test src/components/UserModal.test.tsx src/features/users src/lib/grant-utils.test.ts
pnpm typecheck && pnpm lint
pnpm precheck   # final gate
```
