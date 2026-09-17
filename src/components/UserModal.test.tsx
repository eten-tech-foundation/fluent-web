import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ROLES, type User, type UserGrant } from '@/lib/types';

import { UserModal } from './UserModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) => (opts?.name ? `${key}:${opts.name}` : key),
  }),
}));

// Radix Select needs these jsdom shims to open its dropdown.
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

const grant = (orgId: number | null, projectId: number | null, roleName: string): UserGrant => ({
  orgId,
  projectId,
  roleId: 1,
  roleName,
  permissions: [],
});

const member = (overrides: Partial<User> = {}): User => ({
  id: 2,
  username: 'member1',
  email: 'member@example.com',
  role: ROLES.ORG_MEMBER,
  status: 'verified',
  lastActiveOrgId: 1,
  grants: [grant(1, null, ROLES.ORG_MEMBER)],
  orgGrants: [grant(1, null, ROLES.ORG_MEMBER)],
  ...overrides,
});

const setup = (overrides: Partial<React.ComponentProps<typeof UserModal>> = {}) => {
  const onSave = vi.fn<(u: User | Omit<User, 'id'>) => Promise<void>>(() => Promise.resolve());
  render(
    <UserModal
      isOpen
      activeOrgId={1}
      mode='create'
      onClose={vi.fn()}
      onSave={onSave}
      {...overrides}
    />
  );
  return { onSave, user: userEvent.setup() };
};

describe('UserModal — create', () => {
  it('offers only Org Manager in the role dropdown (project roles stay project-scoped)', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('combobox'));

    await waitFor(() => expect(screen.getByRole('option')).toHaveTextContent('Org Manager'));
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('blocks submit and shows the duplicate notice when the email already belongs to the org', async () => {
    const { user } = setup({ existingEmails: new Set(['member@example.com']) });

    await user.type(screen.getByLabelText(/email/), 'Member@Example.com');
    await user.type(screen.getByLabelText(/username/), 'Someone');

    expect(screen.getByRole('alert')).toHaveTextContent('userAlreadyInOrg');
    expect(screen.getByRole('button', { name: 'addUser' })).toBeDisabled();
  });
});

describe('UserModal — edit', () => {
  it('offers Organization Member + Org Manager, initialised to the org-level role', async () => {
    const { user } = setup({
      mode: 'edit',
      user: member({
        orgGrants: [
          grant(1, null, ROLES.ORG_MEMBER),
          grant(1, 10, ROLES.PROJECT_MANAGER),
          grant(1, null, ROLES.ORG_MANAGER),
        ],
      }),
    });

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Org Manager');

    await user.click(trigger);
    const options = await screen.findAllByRole('option');
    expect(options.map(o => o.textContent)).toEqual(['Organization Member', 'Org Manager']);
  });

  it('shows Organization Member (not the project role) for a PM with no org-level role', () => {
    setup({
      mode: 'edit',
      user: member({
        orgGrants: [grant(1, null, ROLES.ORG_MEMBER), grant(1, 10, ROLES.PROJECT_MANAGER)],
      }),
    });

    expect(screen.getByRole('combobox')).toHaveTextContent('Organization Member');
  });

  it('disables the role dropdown for the current user (D2 self-change)', () => {
    setup({ mode: 'edit', user: member(), disableRoleSelection: true });

    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('reverts the role dropdown when the save rejects', async () => {
    const { user } = setup({
      mode: 'edit',
      user: member(),
      onSave: vi.fn(() => Promise.reject(new Error('boom'))),
    });

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Organization Member');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Org Manager' }));
    expect(trigger).toHaveTextContent('Org Manager');

    await user.click(screen.getByRole('button', { name: 'saveUser' }));

    await waitFor(() => expect(trigger).toHaveTextContent('Organization Member'));
  });
});
