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

import { ROLES, type UserGrant } from '@/lib/types';

/** All roles that carry management privileges (project create, user view, etc). */
const MANAGER_ROLES = ['Project Manager', 'Org Manager', 'Org Owner', 'SuperAdmin'];

/**
 * True if the user holds a global SuperAdmin grant (orgId == null, projectId == null).
 * Looks at ALL grants, not the active-org subset — the global grant has no org.
 */
export function isSuperAdmin(grants: UserGrant[] | undefined): boolean {
  if (!grants) return false;
  return grants.some(
    g => g.orgId === null && (g.projectId ?? null) === null && g.roleName === ROLES.SUPER_ADMIN
  );
}

/**
 * The role to show for a user within one org: the org-level role first
 * (projectId == null, not the Org Member anchor), then the first project role.
 */
export function getOrgRoleName(
  orgGrants: UserGrant[] | undefined,
  orgId: number | null | undefined
): string | undefined {
  if (!orgGrants || orgId == null) return undefined;
  const inOrg = orgGrants.filter(g => g.orgId === orgId && g.roleName !== ROLES.ORG_MEMBER);
  const orgLevel = inOrg.find(g => (g.projectId ?? null) === null);
  return (orgLevel ?? inOrg.at(0))?.roleName;
}

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
 * True if the user has Manager privileges specifically for the given projectId:
 * - Org-level managers (projectId == null/undefined) have manager privileges for all projects in the org.
 * - Project-scoped managers only have manager privileges if their grant matches the projectId.
 */
export function isProjectManager(
  activeGrants: UserGrant[],
  projectId: number | null | undefined
): boolean {
  if (!projectId) return false;
  return activeGrants.some(g => {
    if (!MANAGER_ROLES.includes(g.roleName)) return false;
    if (g.projectId === null || g.projectId === undefined) return true;
    return g.projectId === projectId || g.projectId === Number(projectId);
  });
}

export function isOrgMemberOnly(activeGrants: UserGrant[]): boolean {
  return activeGrants.length > 0 && activeGrants.every(g => g.roleName === 'Org Member');
}

/** True if the user's currently-selected role is Project Observer. */
export function isObserver(activeGrants: UserGrant[]): boolean {
  return activeGrants.some(g => g.roleName === 'Project Observer');
}

const ROLES_WITH_USER_VIEW = ['Org Manager', 'Org Owner', 'SuperAdmin'];
/**
 * Alias: can the user view the /users table?
 * Same as canViewUsers — all manager roles have USER_VIEW.
 */
export function canViewUsers(activeGrants: UserGrant[]): boolean {
  return activeGrants.some(g => ROLES_WITH_USER_VIEW.includes(g.roleName));
}
