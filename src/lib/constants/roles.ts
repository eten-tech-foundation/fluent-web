import { getDisplayRole, ROLES, type RoleOption } from '@/lib/types';

/**
 * Org-level roles managed from the Users page (D1: project roles remain
 * project-scoped and are managed on the project). Choosing 'Org Member' in
 * Edit demotes — the API removes the org-level role row while keeping the
 * membership anchor and all project-scoped grants.
 *
 * In Invite the same list is offered, but 'Org Member' is cosmetic: the
 * invite always creates the Org Member anchor, and re-granting it is an
 * onConflictDoNothing no-op — the pick just doesn't carry a manager grant.
 */
export const ORG_ROLE_OPTIONS: RoleOption[] = [
  { value: ROLES.ORG_MEMBER, label: getDisplayRole(ROLES.ORG_MEMBER) },
  { value: ROLES.ORG_MANAGER, label: getDisplayRole(ROLES.ORG_MANAGER) },
];
