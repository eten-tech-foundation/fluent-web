import { describe, expect, it } from 'vitest';

import { getOrgRoleName, isSuperAdmin } from '@/lib/grant-utils';
import { ROLES, type UserGrant } from '@/lib/types';

const grant = (
  orgId: number | null,
  projectId: number | null | undefined,
  roleName: string
): UserGrant => ({ orgId, projectId, roleId: 1, roleName, permissions: [] });

describe('isSuperAdmin', () => {
  it('is true for a global SuperAdmin grant', () => {
    expect(isSuperAdmin([grant(null, null, ROLES.SUPER_ADMIN)])).toBe(true);
    // projectId omitted entirely (as the API may send it) still counts as global
    expect(isSuperAdmin([grant(null, undefined, ROLES.SUPER_ADMIN)])).toBe(true);
  });

  it('is false for an org-scoped grant even when the role name is SuperAdmin', () => {
    expect(isSuperAdmin([grant(3, null, ROLES.SUPER_ADMIN)])).toBe(false);
  });

  it('is false for Org Manager and for missing grants', () => {
    expect(isSuperAdmin([grant(3, null, ROLES.ORG_MANAGER)])).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
    expect(isSuperAdmin([])).toBe(false);
  });
});

describe('getOrgRoleName', () => {
  const grants = [
    grant(1, null, ROLES.ORG_MEMBER),
    grant(1, 10, ROLES.PROJECT_TRANSLATOR),
    grant(1, null, ROLES.ORG_MANAGER),
    grant(2, null, ROLES.PROJECT_MANAGER),
  ];

  it('prefers the org-level role over project roles and skips the Org Member anchor', () => {
    expect(getOrgRoleName(grants, 1)).toBe(ROLES.ORG_MANAGER);
  });

  it('falls back to the first project role when there is no org-level role', () => {
    const projectOnly = [grant(1, null, ROLES.ORG_MEMBER), grant(1, 10, ROLES.PROJECT_TRANSLATOR)];
    expect(getOrgRoleName(projectOnly, 1)).toBe(ROLES.PROJECT_TRANSLATOR);
  });

  it('is undefined when only the anchor exists, for another org, or with no input', () => {
    expect(getOrgRoleName([grant(1, null, ROLES.ORG_MEMBER)], 1)).toBeUndefined();
    expect(getOrgRoleName(grants, 99)).toBeUndefined();
    expect(getOrgRoleName(undefined, 1)).toBeUndefined();
    expect(getOrgRoleName(grants, null)).toBeUndefined();
  });
});
