import { useCallback } from 'react';

import { useNavigate } from '@tanstack/react-router';

import { authClient } from '@/lib/auth-client';
import { Logger } from '@/lib/services/logger';

export function useAuth() {
  const { data: session, isPending: isLoading } = authClient.useSession();
  const navigate = useNavigate();

  const user = session?.user
    ? {
        ...session.user,
        id: session.user.id,
        image: session.user.image,
        emailVerified: session.user.emailVerified,
      }
    : null;

  const isAuthenticated = !!session;

  const login = useCallback(
    async (returnTo?: string) => {
      try {
        await navigate({
          to: '/login',
          search: { returnTo: returnTo ?? window.location.pathname },
        });
      } catch (error) {
        Logger.logException(error, {
          context: 'Login redirect error',
          returnTo: returnTo ?? window.location.pathname,
        });
        throw error;
      }
    },
    [navigate]
  );

  const logout = useCallback(async () => {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            window.location.href = window.location.origin;
          },
        },
      });
    } catch (error) {
      Logger.logException(error, {
        context: 'Logout error',
      });
      throw error;
    }
  }, []);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };
}
