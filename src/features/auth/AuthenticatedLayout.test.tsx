import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';

import { AuthenticatedLayout } from './AuthenticatedLayout';

const navigate = vi.fn();
const logout = vi.fn(() => Promise.resolve());

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid='outlet' />,
  useLocation: () => ({ pathname: '/', state: {} }),
  useNavigate: () => navigate,
  useSearch: () => ({}),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'translator@example.org', emailVerified: true },
    isAuthenticated: true,
    isLoading: false,
    logout,
  }),
}));
vi.mock('@/features/header/components/index', () => ({ default: () => <header /> }));
vi.mock('@/components/SettingsModal', () => ({ SettingsModal: () => null }));
vi.mock('@/features/profile/components/EditProfile', () => ({ EditProfile: () => null }));
vi.mock('@/features/flags', () => ({ FlagOverrideChip: () => null }));

const userDetailsUrl = `${config.api.url}/users/email/:email`;

const renderLayout = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthenticatedLayout />
    </QueryClientProvider>
  );

beforeEach(() => {
  navigate.mockClear();
  logout.mockClear();
});

describe('AuthenticatedLayout when user details fail to load', () => {
  it('shows an error screen once instead of redirecting to /login', async () => {
    let requests = 0;
    server.use(
      http.get(userDetailsUrl, () => {
        requests++;
        return new HttpResponse(null, { status: 404 });
      })
    );

    renderLayout();

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your account");
    expect(navigate).not.toHaveBeenCalled();
    expect(requests).toBe(1);
  });

  it('fetches again on Try again and opens the app when it succeeds', async () => {
    let requests = 0;
    server.use(
      http.get(userDetailsUrl, () => {
        requests++;
        return requests === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ id: 'u1', email: 'translator@example.org', status: 'verified' });
      })
    );

    renderLayout();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('outlet')).toBeInTheDocument();
    expect(requests).toBe(2);
  });

  it('signs the user out from the error screen', async () => {
    server.use(http.get(userDetailsUrl, () => new HttpResponse(null, { status: 404 })));

    renderLayout();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(logout).toHaveBeenCalledOnce();
  });
});
