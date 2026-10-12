import { getDisplayRole, ROLES, type RoleOption } from '@/lib/types';

/**
 * Org-level roles managed from the Users page (D1: project roles remain
 * project-scoped and are managed on the project). Choosing 'Org Member' in
 * Edit demotes — the API removes the org-level role row while keeping the
 * membership anchor and all project-scoped grants.
 */
export const ORG_ROLE_OPTIONS: RoleOption[] = [
  { value: ROLES.ORG_MEMBER, label: getDisplayRole(ROLES.ORG_MEMBER) },
  { value: ROLES.ORG_MANAGER, label: getDisplayRole(ROLES.ORG_MANAGER) },
];

/**
 * Invite-mode subset: POST /users/invite always creates the Org Member
 * anchor, so the only selectable grant is the org-level role itself.
 */
export const ORG_INVITE_ROLE_OPTIONS: RoleOption[] = ORG_ROLE_OPTIONS.filter(
  o => o.value !== ROLES.ORG_MEMBER
);
