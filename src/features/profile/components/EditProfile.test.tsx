import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { ROLES, type User, type UserGrant } from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { fireEvent, renderWithProviders as render, screen, waitFor } from '@/test/render';

import { EditProfile } from './EditProfile';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { name?: string }) => (opts?.name ? `${key}:${opts.name}` : key),
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// refreshAsync() keys its fetch off the session email — supply one.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'manager@example.com' } }),
}));

// Radix shims, matching the other dialog tests.
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

const grants = [grant(1, null, ROLES.ORG_MEMBER), grant(1, null, ROLES.ORG_MANAGER)];

const manager: User = {
  id: 1,
  username: 'manager1',
  email: 'manager@example.com',
  role: ROLES.ORG_MANAGER,
  status: 'verified',
  lastActiveOrgId: 1,
  firstName: 'Old',
  lastName: 'Name',
  grants,
  orgGrants: grants,
};

/**
 * What PATCH /users/:id actually returns (users.service.toUserResponse):
 * no orgGrants, no role. The refresh GET attaches orgGrants.
 */
const patchResponse = {
  id: 1,
  email: 'manager@example.com',
  username: 'manager1',
  firstName: 'New',
  lastName: 'Name',
  createdBy: null,
  status: 'verified',
  lastActiveOrgId: 1,
  createdAt: null,
  updatedAt: null,
};

const getResponse = { ...patchResponse, orgGrants: grants };

describe('EditProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ userdetail: manager });
    server.use(
      http.patch(`${config.api.url}/users/1`, () => HttpResponse.json(patchResponse)),
      http.get(`${config.api.url}/users/email/manager@example.com`, () =>
        HttpResponse.json(getResponse)
      )
    );
  });

  it('keeps store grants/role after save — the PATCH response carries none', async () => {
    const onClose = vi.fn();
    const { user } = render(<EditProfile isOpen onClose={onClose} />);

    // fireEvent.change sets a value outright — user.clear() is unreliable on
    // this controlled input, so typing could append to 'Old'.
    fireEvent.change(await screen.findByLabelText('firstName'), { target: { value: 'New' } });
    await user.click(screen.getByRole('button', { name: 'saveUser' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const saved = useAppStore.getState().userdetail;
    expect(saved?.grants).toEqual(grants);
    expect(saved?.role).toBe(ROLES.ORG_MANAGER);
    expect(saved?.firstName).toBe('New');
    expect(toast.success).toHaveBeenCalledWith('profileUpdated');
  });

  it('keeps the modal open and shows the error when the save fails', async () => {
    const onClose = vi.fn();
    server.use(
      http.patch(`${config.api.url}/users/1`, () =>
        HttpResponse.json({ message: 'nope' }, { status: 500 })
      )
    );

    const { user } = render(<EditProfile isOpen onClose={onClose} />);
    await user.click(await screen.findByRole('button', { name: 'saveUser' }));

    await screen.findByText('Error: User was not saved.');
    expect(screen.getByRole('button', { name: 'saveUser' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(useAppStore.getState().userdetail?.grants).toEqual(grants);
  });
});
