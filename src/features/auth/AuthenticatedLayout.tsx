import { useEffect, useState } from 'react';

import { Outlet, useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SettingsModal } from '@/components/SettingsModal';
import { Button } from '@/components/ui/button';
import { FlagOverrideChip } from '@/features/flags';
import Header from '@/features/header/components/index';
import { EditProfile } from '@/features/profile/components/EditProfile';
import { useAuth } from '@/hooks/useAuth';
import { useRefreshUserDetail } from '@/hooks/useRefreshUserDetail';
import { useGetUserDetailsMutation, useUpdateUser } from '@/hooks/useUsers';
import { Logger } from '@/lib/services/logger';
import { type User } from '@/lib/types';
import { useAppStore } from '@/store/store';

export function AuthenticatedLayout(): React.JSX.Element {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const { isOrgSwitching } = useAppStore();
  const navigate = useNavigate();
  const { mutate: fetchUserDetails, isPending: isFetchingUserDetails } =
    useGetUserDetailsMutation();
  const { applyUser, refresh: refreshUserDetail } = useRefreshUserDetail();
  const updateUserMutation = useUpdateUser();

  const location = useLocation();
  const { modal } = useSearch({ from: '__root__' });

  // Automatically refresh user details when tab regains focus (e.g., after role change in another browser window)
  useEffect(() => {
    if (!isAuthenticated || !user?.email) return;

    const handleFocus = () => {
      refreshUserDetail();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, user?.email, refreshUserDetail]);

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
  const [userDetailsFailed, setUserDetailsFailed] = useState(false);

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
      timestamp: new Date().toISOString(),
    });

    setFetchInitiated(true);

    // Handle email-verification status upgrade before refreshing the store.
    fetchUserDetails(user.email, {
      onSuccess: userDetails => {
        void (async () => {
          if (userDetails.status !== 'verified' && user.emailVerified) {
            userDetails.status = 'verified';
            await updateUserMutation.mutateAsync({ userData: userDetails as User });
          }
          applyUser(userDetails);
          setUserDetailsFetched(true);
        })();
      },
      // useGetUserDetailsMutation already logs the failure. Stay here rather than redirecting
      // to /login: the session is still valid, so /login sends the user straight back and the
      // fetch repeats in a loop. fetchInitiated stays true until the user retries.
      onError: () => {
        setUserDetailsFetched(false);
        setUserDetailsFailed(true);
      },
    });
  }, [
    isAuthenticated,
    user,
    fetchInitiated,
    fetchUserDetails,
    applyUser,
    updateUserMutation,
    navigate,
  ]);

  if (isLoading) return <LoadingScreen message='Loading...' />;
  if (!isAuthenticated) return <LoadingScreen message='Redirecting to login...' />;
  if (userDetailsFailed)
    return (
      <UserDetailsErrorScreen
        onRetry={() => {
          setUserDetailsFailed(false);
          setFetchInitiated(false);
        }}
        onSignOut={() => void logout()}
      />
    );
  if (isFetchingUserDetails || !userDetailsFetched)
    return <LoadingScreen message='Loading user details...' />;

  return (
    <ErrorBoundary>
      <div className='flex h-screen flex-col overflow-hidden'>
        <Header />
        <main className='relative flex-1 overflow-hidden p-4'>
          {isOrgSwitching && (
            <div className='bg-background/80 absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-xs transition-all duration-200'>
              <div className='bg-card border-border flex items-center gap-3 rounded-lg border px-6 py-4 shadow-lg'>
                <Loader2 className='text-primary h-6 w-6 animate-spin' />
                <span className='text-foreground text-sm font-medium'>
                  Switching organization...
                </span>
              </div>
            </div>
          )}
          <Outlet />
          {/* Renders only when a local feature-flag override is active (see
              features/flags/flagOverrides.ts); otherwise it is `null`. */}
          <FlagOverrideChip />
          <SettingsModal isOpen={modal === 'settings'} onClose={handleModalClose} />
          <EditProfile isOpen={modal === 'profile'} onClose={handleModalClose} />
        </main>
      </div>
    </ErrorBoundary>
  );
}

function UserDetailsErrorScreen({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void;
  onSignOut: () => void;
}): React.JSX.Element {
  return (
    <div className='flex h-screen items-center justify-center p-4'>
      <div className='max-w-md text-center' role='alert'>
        <h1 className='text-foreground mb-2 text-xl font-semibold'>
          We couldn&apos;t load your account
        </h1>
        <p className='text-muted-foreground mb-6'>
          Try again in a moment. If it keeps happening, sign out and sign back in.
        </p>
        <div className='flex justify-center gap-3'>
          <Button onClick={onRetry}>Try again</Button>
          <Button variant='outline' onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
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
