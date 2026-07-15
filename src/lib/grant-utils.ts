/**
 * Shared grant-resolution utilities.
 *
 * The backend stores roles in two tiers:
 *   - Org-level  (orgId != null, projectId == null): Org Owner, Org Manager
 *   - Project-level (orgId != null, projectId != null): Project Manager, Translator, Observer
 *
 * All manager-level roles (including project-scoped Project Manager) can
 * create projects, view users, and see all projects in the org.
 */

import type { UserGrant } from '@/lib/types';

/** All roles that carry management privileges (project create, user view, etc). */
const MANAGER_ROLES = ['Project Manager', 'Org Manager', 'Org Owner', 'SuperAdmin'];

/**
 * Returns the grants that apply to the given active org.
 * Global (orgId == null) grants are always included (SuperAdmin).
 */
export function getActiveGrants(
  grants: UserGrant[] | undefined,
  activeOrgId: number | null | undefined
): UserGrant[] {
  if (!grants) return [];
  return grants.filter(g => g.orgId === activeOrgId || g.orgId === null);
}

/**
 * True if the user has any manager-level role in the active org.
 * Includes Project Manager — they have PROJECT_CREATE, USER_VIEW, etc.
 */
export function isManager(activeGrants: UserGrant[]): boolean {
  return activeGrants.some(g => MANAGER_ROLES.includes(g.roleName));
}

/**
 * Alias: can the user view the /users table?
 * Same as isManager — all manager roles have USER_VIEW.
 */
export function canViewUsers(activeGrants: UserGrant[]): boolean {
  return isManager(activeGrants);
}
