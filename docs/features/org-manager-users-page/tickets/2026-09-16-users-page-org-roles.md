# Users page: Org Manager / Project Manager roles in Add and Edit User

> **Status: IMPLEMENTED (local)** — on `feat/org-manager-self-service`, awaiting review before push.
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

The Role dropdown offered Project Manager **and** Translator (`src/lib/constants/roles.ts`) — project-scoped roles that do not belong on this page.

## Product decisions (resolved 2026-09-16)

- **D1 → Option (b):** The Users page manages org-level roles only. Project roles stay project-scoped and are set on the project. The dropdown offers `Org Manager` (and `Org Member` in Edit = demote). A PM can be promoted to OM; an OM+PM demoted keeps their PM grant.
- **D2 → Self-change block is the guard:** an Org Manager cannot change their own role — only another OM can demote them, so the org always keeps ≥1 OM. Self-removal is likewise blocked (API + hidden row action).
- **D3 → role column order (top wins):** no role → `Organization Member`; org-level role; else project roles in order `Project Manager` → `Translator` → `Observer`.
- **New scope:** an Org Manager can remove a user from the org; a confirm banner warns "Their chapter assignments will be removed." when the target holds assignments (same pattern as project removal).

## Tasks

### W1. Org-level role options and role display (D1 + D3)

Files: `src/lib/constants/roles.ts`, `src/lib/grant-utils.ts` (+ test), `src/components/UserModal.tsx`, `src/features/users/components/ListUsers.tsx`, `UsersWrapper.tsx`

- [x] `roles.ts`: `roleOptions`/`getRoleLabel` replaced by `ORG_ROLE_OPTIONS` (`Org Member` + `Org Manager`, edit) and `ORG_INVITE_ROLE_OPTIONS` (OM only — invite always creates the anchor, so 'Org Member' would double-grant and 500).
- [x] `getOrgRoleName` implements the D3 order; new `getOrgLevelRoleName` returns the editable org-level role (Org Member for anchor-only). Tests updated + extended (priority order, member fallback, cross-org isolation).
- [x] `ListUsers` renders `getDisplayRole(getOrgRoleName(...) ?? 'No Role')` with `activeOrgId` from the wrapper. `OrganizationDetailPage` picks up the same D3 order via the shared helper.
- [x] `UserModal` edit-mode initial role uses `getOrgLevelRoleName`.

### W2. Duplicate-email guard in Add User

- [x] `existingEmails?: ReadonlySet<string>` prop (lowercased), built in `UsersWrapper`; `isDuplicateEmail` folded into `isFormValid()`; inline `userAlreadyInOrg` alert under the email field. Tested case-insensitively.

### W3. Add failure keeps dialog open — covered

- [x] `onSave` rejection → dialog open, error shown (covered by the UsersWrapper failure test; InviteOrgManagerModal.test.tsx covers the same pattern).

### W4. Edit User — save role via org endpoint, revert on failure

- [x] `useUpdateOrgUserRole` → `PATCH /organizations/:orgId/users/:userId`, invalidates `['users']` + `['organizationUsers']`.
- [x] `handleSaveUser` edit branch diffs profile fields (normalised `?? ''`) separately from the org-level role; PATCHes only what changed; profile first, then role; rethrows after `setUserError`.
- [x] `UserModal.handleSubmit` catch reverts `role` to the initial value in edit mode.
- [x] `disableRoleSelection` for self-row unchanged (D2).

### W5. Regression tests

- [x] `MainMenu.test.tsx` (new): OM → Users item; project-scoped PM → none; anchor-only member → neither Projects nor Users.
- [x] `RoleBasedHomePage.test.tsx` (new): OM → `/projects`; SuperAdmin → `/organizations`; member-only → no-assignments page.
- [x] `/users` + `/organizations*` route guards already covered in `route-guards.test.ts`.

### W6. Remove from org (new scope per Product)

- [x] Trash action per row (hidden on the current user's row); `RemoveOrgUserBanner` confirm with `assignmentsWillBeRemoved` when `useChapterAssignmentsByUserId` returns assignments; `useRemoveOrgUser` → `DELETE /organizations/:orgId/users/:userId`; success toast; banner retains the error on failure.

### W7. Manual QA (env with fluent-api#337 deployed, seeded `org_manager`)

- [ ] Org Manager login → Projects; menu shows Dashboard, Projects, Users.
- [ ] Add Org Manager (new email) → row appears, invite email sent.
- [ ] Add duplicate email (`invited` and `verified` cases) → inline error, disabled.
- [ ] Add email existing in Fluent but not this org → existing-user path succeeds.
- [ ] Offline → Add fails, dialog open with values, error shown.
- [ ] Edit another user Member ↔ Org Manager → table updates; they see Users nav on next load.
- [ ] Own row → Role disabled + no remove action. Force role PATCH 500 → dropdown reverts, error shown.
- [ ] Remove a member with assignments → warning shown → DELETE clears assignments + grants.
- [ ] Project Manager login → no Users nav; `/users` → `/`.

## Verification

```
pnpm test src/components/UserModal.test.tsx src/features/users src/lib/grant-utils.test.ts
pnpm typecheck && pnpm lint
pnpm precheck   # final gate
```
