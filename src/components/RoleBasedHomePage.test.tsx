import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ROLES, type User, type UserGrant } from '@/lib/types';
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

const withUser = (userdetail: Partial<User>) =>
  useAppStore.setState({ userdetail: userdetail as User });

describe('RoleBasedHomePage landing (#489 regression)', () => {
  it('lands an Org Manager on /projects', () => {
    withUser({
      role: ROLES.ORG_MANAGER,
      lastActiveOrgId: 1,
      grants: [grant(1, null, ROLES.ORG_MEMBER), grant(1, null, ROLES.ORG_MANAGER)],
    });

    render(<RoleBasedHomePage />);

    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/projects');
  });

  it('lands a SuperAdmin on /organizations', () => {
    withUser({
      role: ROLES.SUPER_ADMIN,
      lastActiveOrgId: null,
      grants: [grant(null, null, ROLES.SUPER_ADMIN)],
    });

    render(<RoleBasedHomePage />);

    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/organizations');
  });

  it('lands an anchor-only Org Member on the no-assignments page', () => {
    withUser({
      role: ROLES.ORG_MEMBER,
      lastActiveOrgId: 1,
      grants: [grant(1, null, ROLES.ORG_MEMBER)],
    });

    render(<RoleBasedHomePage />);

    expect(screen.getByTestId('no-assignments')).toBeInTheDocument();
  });
});
