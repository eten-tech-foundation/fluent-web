import { useEffect, useState } from 'react';

import { Outlet } from '@tanstack/react-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import { useGetUserDetailsMutation, useUpdateUser } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import { type User } from '@/lib/types';
import { useAppStore } from '@/store/store';

export function AuthenticatedLayout(): React.JSX.Element {
  const { user, isAuthenticated, isLoading, loginWithRedirect } = useAuth();
  const { mutate: fetchUserDetails, isPending: isFetchingUserDetails } =
    useGetUserDetailsMutation();
  const updateUserMutation = useUpdateUser();
  const { setUserDetail } = useAppStore();

  const [userDetailsFetched, setUserDetailsFetched] = useState(false);
  const [fetchInitiated, setFetchInitiated] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void loginWithRedirect({
        appState: { returnTo: window.location.pathname + window.location.search },
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  useEffect(() => {
    if (!isAuthenticated || !user?.email || fetchInitiated) return;

    Logger.logEvent('UserAuthenticated', {
      userId: user.sub,
      userEmail: user.email,
      timestamp: new Date().toISOString(),
    });

    setFetchInitiated(true);

    fetchUserDetails(user.email, {
      onSuccess: userDetails => {
        void (async () => {
          if (userDetails.status !== 'verified' && user.email_verified) {
            userDetails.status = 'verified';
            await updateUserMutation.mutateAsync({
              userData: userDetails as User,
              email: userDetails.email,
            });
          }
          setUserDetail({
            id: userDetails.id,
            email: userDetails.email,
            username: userDetails.username,
            role: userDetails.role,
            organization: userDetails.organization,
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
        void loginWithRedirect({
          appState: { returnTo: window.location.pathname + window.location.search },
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
    loginWithRedirect,
  ]);

  if (isLoading) return <LoadingScreen message='Loading...' />;
  if (!isAuthenticated) return <LoadingScreen message='Redirecting to login...' />;
  if (isFetchingUserDetails || !userDetailsFetched)
    return <LoadingScreen message='Loading user details...' />;

  return (
    <ErrorBoundary>
      <Outlet />
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
