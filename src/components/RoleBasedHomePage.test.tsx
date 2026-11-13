import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ROLES, type UserDetail, type UserGrant } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { RoleBasedHomePage } from './RoleBasedHomePage';

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid='navigate' data-to={to} />,
}));

vi.mock('@/components/NoAssignmentsPage', () => ({
  NoAssignmentsPage: () => <div data-testid='no-assignments' />,
}));
vi.mock('@/features/dashboard/observer', () => ({
  ObserverDashboard: () => <div data-testid='observer-dashboard' />,
}));
vi.mock('@/features/dashboard/user', () => ({
  UserDashboard: () => <div data-testid='user-dashboard' />,
}));

const grant = (orgId: number | null, projectId: number | null, roleName: string): UserGrant => ({
  orgId,
  projectId,
  roleId: 1,
  roleName,
  permissions: [],
});

const withUser = (userdetail: Partial<UserDetail>) =>
  useAppStore.setState({ userdetail: userdetail as UserDetail });

describe('RoleBasedHomePage landing (#489 regression)', () => {
  it('lands an Org Manager on /projects', () => {
    withUser({
      activeRoleName: ROLES.ORG_MANAGER,
      lastActiveOrgId: 1,
      grants: [grant(1, null, ROLES.ORG_MEMBER), grant(1, null, ROLES.ORG_MANAGER)],
    });

    render(<RoleBasedHomePage />);

    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/projects');
  });

  it('lands a SuperAdmin on /organizations', () => {
    withUser({
      activeRoleName: ROLES.SUPER_ADMIN,
      lastActiveOrgId: null,
      grants: [grant(null, null, ROLES.SUPER_ADMIN)],
    });

    render(<RoleBasedHomePage />);

    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/organizations');
  });

  it('lands an anchor-only Org Member on the no-assignments page', () => {
    withUser({
      activeRoleName: ROLES.ORG_MEMBER,
      lastActiveOrgId: 1,
      grants: [grant(1, null, ROLES.ORG_MEMBER)],
    });

    render(<RoleBasedHomePage />);

    expect(screen.getByTestId('no-assignments')).toBeInTheDocument();
  });

  it('falls back to functionalGrant when activeRoleName is null', () => {
    withUser({
      activeRoleName: null,
      lastActiveOrgId: 1,
      grants: [grant(1, null, ROLES.ORG_MEMBER), grant(1, 10, ROLES.PROJECT_OBSERVER)],
    });

    render(<RoleBasedHomePage />);

    expect(screen.getByTestId('observer-dashboard')).toBeInTheDocument();
  });

  it('lands on no-assignments when activeRoleName is null and user only holds Org Member', () => {
    withUser({
      activeRoleName: null,
      lastActiveOrgId: 1,
      grants: [grant(1, null, ROLES.ORG_MEMBER)],
    });

    render(<RoleBasedHomePage />);

    expect(screen.getByTestId('no-assignments')).toBeInTheDocument();
  });
});
