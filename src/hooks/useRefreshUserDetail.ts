import { useCallback } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useGetUserDetailsMutation } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import type { User } from '@/lib/types';
import { ROLES } from '@/lib/types';
import { useAppStore } from '@/store/store';

/**
 * Shared hook for syncing the Zustand store with fresh user+grant data.
 */
export function useRefreshUserDetail() {
  const { user: authUser } = useAuth();
  const { userdetail, setUserDetail } = useAppStore();
  const { mutate: fetchUserDetails, mutateAsync: fetchUserDetailsAsync } =
    useGetUserDetailsMutation();

  const applyUser = useCallback(
    (freshUser: User) => {
      const grants = freshUser.orgGrants ?? freshUser.grants ?? [];

      // Validate that lastActiveOrgId is still a live grant for the user.
      let activeOrgId = freshUser.lastActiveOrgId;
      const hasGrantsForActiveOrg =
        activeOrgId != null && grants.some(g => g.orgId === activeOrgId);
      if (!hasGrantsForActiveOrg) {
        activeOrgId = grants.find(g => g.orgId !== null)?.orgId;
      }

      const orgGrants = activeOrgId != null ? grants.filter(g => g.orgId === activeOrgId) : [];

      // Preserve the user's previously-selected role if it is still valid.
      const functionalGrant = orgGrants.find(g => g.roleName !== ROLES.ORG_MEMBER);
      const savedRole = userdetail?.role;
      const isSavedRoleFunctional =
        savedRole &&
        savedRole !== ROLES.ORG_MEMBER &&
        orgGrants.some(g => g.roleName === savedRole);

      const savedGrant = isSavedRoleFunctional
        ? orgGrants.find(g => g.roleName === savedRole)
        : undefined;

      const activeGrant =
        savedGrant ?? functionalGrant ?? (orgGrants.length > 0 ? orgGrants[0] : undefined);

      setUserDetail({
        id: freshUser.id,
        email: freshUser.email,
        username: freshUser.username,
        role: activeGrant ? activeGrant.roleName : freshUser.role,
        lastActiveOrgId: activeOrgId,
        grants,
        firstName: freshUser.firstName,
        lastName: freshUser.lastName,
        status: freshUser.status,
      });
    },
    [setUserDetail, userdetail?.role]
  );

  const refresh = useCallback(() => {
    if (!authUser?.email) return;

    fetchUserDetails(authUser.email, {
      onSuccess: applyUser,
      onError: error => {
        Logger.logException(error instanceof Error ? error : new Error(String(error)), {
          source: 'useRefreshUserDetail',
          userEmail: authUser.email,
        });
      },
    });
  }, [authUser?.email, fetchUserDetails, applyUser]);

  /** Awaitable version of refresh — resolves after the user data has been fetched and applied. */
  const refreshAsync = useCallback(async () => {
    if (!authUser?.email) return;

    const freshUser = await fetchUserDetailsAsync(authUser.email);
    applyUser(freshUser);
  }, [authUser?.email, fetchUserDetailsAsync, applyUser]);

  return { refresh, refreshAsync, applyUser };
}
