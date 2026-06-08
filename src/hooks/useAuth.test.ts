import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuth } from '@/hooks/useAuth';

import type * as ReactRouter from '@tanstack/react-router';

const { mockNavigate, mockUseSession, mockSignOut } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseSession: vi.fn<() => unknown>(),
  mockSignOut: vi.fn(),
}));

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof ReactRouter>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
    signOut: mockSignOut,
  },
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports no user when there is no session', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('exposes the session user and authenticated state when signed in', () => {
    mockUseSession.mockReturnValue({
      data: {
        user: { id: 'u1', email: 'pm@fluent.local', name: 'PM', emailVerified: true, image: null },
      },
      isPending: false,
    });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toMatchObject({
      id: 'u1',
      email: 'pm@fluent.local',
      emailVerified: true,
    });
  });

  it('passes the session pending state through as isLoading', () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(true);
  });

  it('login() navigates to /login carrying the requested returnTo', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.login('/projects/42');
    });
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/login',
      search: { returnTo: '/projects/42' },
    });
  });

  it('logout() calls authClient.signOut', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    mockSignOut.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.logout();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
