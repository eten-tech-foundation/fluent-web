import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { ROLES, type User, type UserGrant } from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { renderWithProviders as render, screen, waitFor } from '@/test/render';

import { UsersWrapper } from './UsersWrapper';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) => (opts?.name ? `${key}:${opts.name}` : key),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { mockNavigate, search } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  search: { current: {} as Record<string, unknown> },
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useSearch: () => search.current }),
  useNavigate: () => mockNavigate,
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

const caller: User = {
  id: 1,
  username: 'manager1',
  email: 'manager@example.com',
  role: ROLES.ORG_MANAGER,
  status: 'verified',
  lastActiveOrgId: 1,
  grants: [grant(1, null, ROLES.ORG_MEMBER), grant(1, null, ROLES.ORG_MANAGER)],
};

const target: User = {
  id: 2,
  username: 'member1',
  email: 'member@example.com',
  role: ROLES.ORG_MEMBER,
  status: 'verified',
  lastActiveOrgId: 1,
  orgGrants: [grant(1, null, ROLES.ORG_MEMBER)],
};

describe('UsersWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.current = {};
    useAppStore.setState({ userdetail: caller });
    server.use(http.get(`${config.api.url}/users`, () => HttpResponse.json([caller, target])));
  });

  it('PATCHes the org-users role endpoint (not /users/:id) when only the role changes', async () => {
    search.current = { modal: 'edit', userId: 2 };

    let roleBody: unknown;
    server.use(
      http.patch(`${config.api.url}/organizations/1/users/2`, async ({ request }) => {
        roleBody = await request.json();
        return HttpResponse.json({ ...target, role: ROLES.ORG_MANAGER });
      }),
      http.patch(`${config.api.url}/users/2`, () => {
        throw new Error('profile PATCH must not be called for a role-only change');
      })
    );

    const { user } = render(<UsersWrapper />);

    const trigger = await screen.findByRole('combobox');
    // The users query resolves async; the role is seeded when it does.
    await waitFor(() => expect(trigger).toHaveTextContent('Organization Member'));

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Org Manager' }));
    await user.click(screen.getByRole('button', { name: 'saveUser' }));

    await waitFor(() => expect(roleBody).toEqual({ roleName: ROLES.ORG_MANAGER }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ search: {} }))
    );
  });

  it('keeps the dialog open and surfaces the error when the role save fails', async () => {
    search.current = { modal: 'edit', userId: 2 };
    server.use(
      http.patch(`${config.api.url}/organizations/1/users/2`, () =>
        HttpResponse.json({ message: 'nope' }, { status: 500 })
      )
    );

    const { user } = render(<UsersWrapper />);

    const trigger = await screen.findByRole('combobox');
    await waitFor(() => expect(trigger).toHaveTextContent('Organization Member'));
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Org Manager' }));
    await user.click(screen.getByRole('button', { name: 'saveUser' }));

    await screen.findByText('Error: Role was not saved.');
    // Dialog is still open, and the dropdown reverted to the pre-save role.
    expect(screen.getByRole('button', { name: 'saveUser' })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveTextContent('Organization Member'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('removes a member via the confirm banner, warning about their assignments', async () => {
    const removeSpy = vi.fn(() => new HttpResponse(null, { status: 204 }));
    server.use(
      http.delete(`${config.api.url}/organizations/1/users/2`, removeSpy),
      http.get(`${config.api.url}/users/2/chapter-assignments`, () =>
        HttpResponse.json({
          assignedChapters: [{ chapterAssignmentId: 9 }],
          peerCheckChapters: [],
        })
      )
    );

    const { user } = render(<UsersWrapper />);

    // Own row must not offer remove (D2 self-removal guard)
    await screen.findByText('member@example.com');
    const removeButtons = screen.getAllByRole('button', { name: 'removeUserFromOrg' });
    expect(removeButtons).toHaveLength(1);

    await user.click(removeButtons[0]);
    await screen.findByText('removeFromOrgConfirm:member1');
    await screen.findByText('assignmentsWillBeRemoved');

    await user.click(screen.getByRole('button', { name: 'remove' }));

    await waitFor(() => expect(removeSpy).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByText('removeFromOrgConfirm:member1')).not.toBeInTheDocument()
    );
    expect(toast.success).toHaveBeenCalledWith('userRemovedFromOrg:member1');
  });

  it('shows the D3 role column: org-level role wins, then PM > Translator > Observer, then member', async () => {
    server.use(
      http.get(`${config.api.url}/users`, () =>
        HttpResponse.json([
          { ...target, orgGrants: [grant(1, null, ROLES.ORG_MEMBER)] },
          {
            id: 3,
            username: 'pm1',
            email: 'pm@example.com',
            role: ROLES.ORG_MEMBER,
            orgGrants: [
              grant(1, null, ROLES.ORG_MEMBER),
              grant(1, 11, ROLES.PROJECT_OBSERVER),
              grant(1, 10, ROLES.PROJECT_MANAGER),
            ],
          },
          {
            id: 4,
            username: 'om1',
            email: 'om@example.com',
            role: ROLES.ORG_MANAGER,
            orgGrants: [
              grant(1, null, ROLES.ORG_MEMBER),
              grant(1, 10, ROLES.PROJECT_MANAGER),
              grant(1, null, ROLES.ORG_MANAGER),
            ],
          },
        ])
      )
    );

    render(<UsersWrapper />);

    const rowFor = async (email: string) =>
      (await screen.findByText(email)).closest('tr') as HTMLTableRowElement;

    await waitFor(async () => {
      expect(await rowFor('member@example.com')).toHaveTextContent('Organization Member');
      expect(await rowFor('pm@example.com')).toHaveTextContent('Project Manager');
      expect(await rowFor('om@example.com')).toHaveTextContent('Org Manager');
    });
  });
});
