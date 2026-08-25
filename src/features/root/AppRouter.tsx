import { useEffect } from 'react';

import { RouterProvider } from '@tanstack/react-router';

import { useAuth } from '@/hooks/useAuth';
import { canViewUsers, getActiveGrants, isManager } from '@/lib/grant-utils';
import { router } from '@/lib/router';
import { useAppStore } from '@/store/store';

export function AppRouter(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const { userdetail } = useAppStore();

  const activeGrants = getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId);
  const activeRoleGrants = activeGrants.filter(g => g.roleName === userdetail?.role);
  const managerState = isManager(activeRoleGrants);
  const viewUsersState = canViewUsers(activeRoleGrants);

  // Invalidate router when auth state or permissions change so route guards re-evaluate
  useEffect(() => {
    void router.invalidate();
  }, [isAuthenticated, isLoading, managerState, viewUsersState]);

  return (
    <RouterProvider
      context={{
        auth: {
          isAuthenticated,
          isLoading,
          isManager: managerState,
          canViewUsers: viewUsersState,
        },
      }}
      router={router}
    />
  );
}
