import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ROLES, type User, type UserGrant } from '@/lib/types';
import { useAppStore } from '@/store/store';

import MainMenu from './MainMenu';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 }, isAuthenticated: true }),
}));

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
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

const openMenu = async () => {
  const user = userEvent.setup();
  render(
    <MainMenu
      onDashboardClick={vi.fn()}
      onOrganizationsClick={vi.fn()}
      onProjectsClick={vi.fn()}
      onUsersClick={vi.fn()}
    >
      <button type='button'>menu</button>
    </MainMenu>
  );
  await user.click(screen.getByRole('button', { name: 'menu' }));
};

describe('MainMenu visibility (#489 regression)', () => {
  it('shows the Users item for an Org Manager', async () => {
    withUser({
      role: ROLES.ORG_MANAGER,
      lastActiveOrgId: 1,
      grants: [grant(1, null, ROLES.ORG_MEMBER), grant(1, null, ROLES.ORG_MANAGER)],
    });

    await openMenu();

    expect(screen.getByText('users')).toBeInTheDocument();
    expect(screen.getByText('projects')).toBeInTheDocument();
    expect(screen.queryByText('organizations')).not.toBeInTheDocument();
  });

  it('shows no Users item for a project-scoped Project Manager', async () => {
    withUser({
      role: ROLES.PROJECT_MANAGER,
      lastActiveOrgId: 1,
      grants: [grant(1, null, ROLES.ORG_MEMBER), grant(1, 10, ROLES.PROJECT_MANAGER)],
    });

    await openMenu();

    expect(screen.queryByText('users')).not.toBeInTheDocument();
    expect(screen.getByText('projects')).toBeInTheDocument();
  });

  it('hides Projects and Users for an anchor-only Org Member', async () => {
    withUser({
      role: ROLES.ORG_MEMBER,
      lastActiveOrgId: 1,
      grants: [grant(1, null, ROLES.ORG_MEMBER)],
    });

    await openMenu();

    expect(screen.queryByText('users')).not.toBeInTheDocument();
    expect(screen.queryByText('projects')).not.toBeInTheDocument();
  });
});
