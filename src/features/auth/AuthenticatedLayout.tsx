import { useEffect, useState } from 'react';

import { Outlet, useLocation, useNavigate, useSearch } from '@tanstack/react-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SettingsModal } from '@/components/SettingsModal';
import Header from '@/features/header/components/index';
import { EditProfile } from '@/features/profile/components/EditProfile';
import { useAuth } from '@/hooks/useAuth';
import { useGetUserDetailsMutation, useUpdateUser } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import { ROLES, type User, type UserGrant } from '@/lib/types';
import { useAppStore } from '@/store/store';

export function AuthenticatedLayout(): React.JSX.Element {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { mutate: fetchUserDetails, isPending: isFetchingUserDetails } =
    useGetUserDetailsMutation();
  const updateUserMutation = useUpdateUser();
  const { setUserDetail, userdetail } = useAppStore();
  const location = useLocation();
  const { modal } = useSearch({ from: '__root__' });

  const handleModalClose = (): void => {
    void navigate({
      to: location.pathname,
      search: prev => ({ ...prev, modal: undefined }),
      state: location.state,
      replace: true,
    });
  };

  const [userDetailsFetched, setUserDetailsFetched] = useState(false);
  const [fetchInitiated, setFetchInitiated] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate({
        to: '/login',
        search: { returnTo: window.location.pathname + window.location.search },
      });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated || !user?.email || fetchInitiated) return;

    Logger.logEvent('UserAuthenticated', {
      userId: user.id,
      userEmail: user.email,
      timestamp: new Date().toISOString(),
    });

    setFetchInitiated(true);

    fetchUserDetails(user.email, {
      onSuccess: userDetails => {
        void (async () => {
          if (userDetails.status !== 'verified' && user.emailVerified) {
            userDetails.status = 'verified';
            await updateUserMutation.mutateAsync({
              userData: userDetails as User,
            });
          }
          const grants = userDetails.orgGrants ?? userDetails.grants ?? [];

          // Validate that lastActiveOrgId is still valid (user still has grants for it)
          let activeOrgId = userDetails.lastActiveOrgId;
          const hasGrantsForActiveOrg =
            activeOrgId != null && grants.some(g => g.orgId === activeOrgId);
          if (!hasGrantsForActiveOrg) {
            // Fall back to the first org the user still has access to
            activeOrgId = grants.find(g => g.orgId !== null)?.orgId;
          }
          // Select active role with fallback priority:
          // 1. Keep currently selected role if it still exists in this org
          // 2. Otherwise switch to any remaining functional role in this org
          // 3. Otherwise fall back to the Org Member anchor row
          const orgGrants = activeOrgId != null ? grants.filter(g => g.orgId === activeOrgId) : [];
          const activeGrant: UserGrant =
            orgGrants.find(g => g.roleId === (userdetail?.role ?? userDetails.role)) ??
            orgGrants.find(g => g.roleName !== ROLES.ORG_MEMBER) ??
            orgGrants[0];

          setUserDetail({
            id: userDetails.id,
            email: userDetails.email,
            username: userDetails.username,
            role: activeGrant.roleId,
            lastActiveOrgId: activeOrgId,
            grants: grants,
            firstName: userDetails.firstName,
            lastName: userDetails.lastName,
            status: userDetails.status,
          });
          setUserDetailsFetched(true);
        })();
      },
      onError: error => {
        Logger.logException(error instanceof Error ? error : new Error(String(error)), {
          source: 'FetchUserDetails',
          userEmail: user.email,
        });
        setFetchInitiated(false);
        setUserDetailsFetched(false);
        void navigate({
          to: '/login',
          search: { returnTo: window.location.pathname + window.location.search },
        });
      },
    });
  }, [
    isAuthenticated,
    user,
    fetchInitiated,
    fetchUserDetails,
    setUserDetail,
    updateUserMutation,
    navigate,
    userdetail?.role,
  ]);

  if (isLoading) return <LoadingScreen message='Loading...' />;
  if (!isAuthenticated) return <LoadingScreen message='Redirecting to login...' />;
  if (isFetchingUserDetails || !userDetailsFetched)
    return <LoadingScreen message='Loading user details...' />;

  return (
    <ErrorBoundary>
      <div className='flex h-screen flex-col overflow-hidden'>
        <Header />
        <main className='flex-1 overflow-hidden p-4'>
          <Outlet />
          <SettingsModal isOpen={modal === 'settings'} onClose={handleModalClose} />
          <EditProfile isOpen={modal === 'profile'} onClose={handleModalClose} />
        </main>
      </div>
    </ErrorBoundary>
  );
}

function LoadingScreen({ message }: { message: string }): React.JSX.Element {
  return (
    <ErrorBoundary>
      <div className='flex h-screen items-center justify-center'>
        <div className='text-center'>
          <div className='mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600' />
          <p className='text-lg text-gray-600 dark:text-gray-400'>{message}</p>
        </div>
      </div>
    </ErrorBoundary>
  );
}
