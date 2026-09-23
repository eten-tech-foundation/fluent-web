import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRefreshUserDetail } from '@/hooks/useRefreshUserDetail';
import type { User, UserGrant } from '@/lib/types';
import { ROLES } from '@/lib/types';
import { useAppStore } from '@/store/store';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'test@example.com' } }),
}));

vi.mock('@/hooks/useUsers', () => ({
  useGetUserDetailsMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  }),
}));

describe('useRefreshUserDetail', () => {
  beforeEach(() => {
    useAppStore.setState({
      userdetail: {
        id: 1,
        email: 'test@example.com',
        username: 'testuser',
        role: ROLES.PROJECT_OBSERVER,
        lastActiveOrgId: 100,
        grants: [
          {
            orgId: 100,
            projectId: 1,
            roleName: ROLES.PROJECT_OBSERVER,
          } as UserGrant,
        ],
        firstName: 'Test',
        lastName: 'User',
        status: 'active',
      },
    });
  });

  it('promotes user role from Project Observer to Project Translator when fresh grants contain a functional editing role', () => {
    const { result } = renderHook(() => useRefreshUserDetail());

    const freshUser: User = {
      id: 1,
      email: 'test@example.com',
      username: 'testuser',
      role: ROLES.PROJECT_TRANSLATOR,
      lastActiveOrgId: 100,
      grants: [
        {
          orgId: 100,
          projectId: 1,
          roleName: ROLES.PROJECT_TRANSLATOR,
        } as UserGrant,
      ],
      firstName: 'Test',
      lastName: 'User',
      status: 'active',
    };

    result.current.applyUser(freshUser);

    const updatedUserdetail = useAppStore.getState().userdetail;
    expect(updatedUserdetail).not.toBeNull();
    expect(updatedUserdetail!.role).toBe(ROLES.PROJECT_TRANSLATOR);
  });
});
