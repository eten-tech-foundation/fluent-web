import { describe, expect, it } from 'vitest';

import { getOrgLevelRoleName, getOrgRoleName, isSuperAdmin } from '@/lib/grant-utils';
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

  it('applies the D3 project-role order (PM > Translator > Observer) when no org-level role', () => {
    const projectOnly = [
      grant(1, null, ROLES.ORG_MEMBER),
      grant(1, 11, ROLES.PROJECT_OBSERVER),
      grant(1, 10, ROLES.PROJECT_TRANSLATOR),
      grant(1, 12, ROLES.PROJECT_MANAGER),
    ];
    expect(getOrgRoleName(projectOnly, 1)).toBe(ROLES.PROJECT_MANAGER);
  });

  it('falls back to a single project role when there is no org-level role', () => {
    const projectOnly = [grant(1, null, ROLES.ORG_MEMBER), grant(1, 10, ROLES.PROJECT_TRANSLATOR)];
    expect(getOrgRoleName(projectOnly, 1)).toBe(ROLES.PROJECT_TRANSLATOR);
  });

  it('returns Org Member when only the anchor exists (D3: no role shows member)', () => {
    expect(getOrgRoleName([grant(1, null, ROLES.ORG_MEMBER)], 1)).toBe(ROLES.ORG_MEMBER);
  });

  it('is undefined for another org or with no input', () => {
    expect(getOrgRoleName(grants, 99)).toBeUndefined();
    expect(getOrgRoleName(undefined, 1)).toBeUndefined();
    expect(getOrgRoleName(grants, null)).toBeUndefined();
  });
});

describe('getOrgLevelRoleName', () => {
  it('returns the org-level role, ignoring project roles', () => {
    const grants = [
      grant(1, null, ROLES.ORG_MEMBER),
      grant(1, 10, ROLES.PROJECT_MANAGER),
      grant(1, null, ROLES.ORG_MANAGER),
    ];
    expect(getOrgLevelRoleName(grants, 1)).toBe(ROLES.ORG_MANAGER);
  });

  it('returns Org Member when the user has only the anchor (even with project roles)', () => {
    const grants = [grant(1, null, ROLES.ORG_MEMBER), grant(1, 10, ROLES.PROJECT_MANAGER)];
    expect(getOrgLevelRoleName(grants, 1)).toBe(ROLES.ORG_MEMBER);
  });

  it('is undefined when the user has no grants in the org', () => {
    expect(getOrgLevelRoleName([grant(2, null, ROLES.ORG_MANAGER)], 1)).toBeUndefined();
    expect(getOrgLevelRoleName(undefined, 1)).toBeUndefined();
    expect(getOrgLevelRoleName([grant(1, null, ROLES.ORG_MEMBER)], null)).toBeUndefined();
  });
});
