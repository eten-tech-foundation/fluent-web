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

export const ORG_LEVEL_ROLES = [
  ROLES.ORG_MANAGER,
  ROLES.ORG_OWNER,
  ROLES.SUPER_ADMIN,
] as readonly string[];

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
 * True if the user holds a grant for this project, or an org-level manager role.
 */
export function hasGrantForProject(
  activeGrants: UserGrant[],
  projectId: number | string | null | undefined
): boolean {
  if (!projectId) return false;
  const targetId = Number(projectId);
  return activeGrants.some(g =>
    g.projectId == null ? ORG_LEVEL_ROLES.includes(g.roleName) : g.projectId === targetId
  );
}

/**
 * True if the user has any manager-level role in the active org.
 * Includes Project Manager — they have PROJECT_CREATE, USER_VIEW, etc.
 */
export function isManager(activeGrants: UserGrant[]): boolean {
  return activeGrants.some(g => MANAGER_ROLES.includes(g.roleName));
}

/**
 * TEMPORARY (#410): Project Managers can still create projects for now,
 * since there's no Org Manager dashboard yet for them to use instead.
 * The ticket specifies org managers only. To remove PM access once the
 * OM dashboard ships, flip this to `false` — nothing else needs to change.
 */
const ALLOW_PROJECT_MANAGER_TO_CREATE_PROJECT: boolean = true;

const PROJECT_CREATE_ROLES: readonly string[] = [
  ...ORG_LEVEL_ROLES,
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional manual toggle, not always true at authoring time
  ...(ALLOW_PROJECT_MANAGER_TO_CREATE_PROJECT ? [ROLES.PROJECT_MANAGER] : []),
];

/**
 * True if the user can create projects.
 * Currently: org-level roles + Project Manager (see flag above).
 * Spec (#410) target state: org-level roles only.
 */
export function canCreateProject(activeGrants: UserGrant[]): boolean {
  return activeGrants.some(g => PROJECT_CREATE_ROLES.includes(g.roleName));
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
