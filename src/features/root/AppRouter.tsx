import { RouterProvider } from '@tanstack/react-router';

import { useAuth } from '@/hooks/useAuth';
import { router } from '@/lib/router';
import { useAppStore } from '@/store/store';

export function AppRouter(): React.JSX.Element {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth();
  const { userdetail } = useAppStore();
  return (
    <RouterProvider
      context={{
        auth: { isAuthenticated, isLoading, role: userdetail?.role ?? null, loginWithRedirect },
      }}
      router={router}
    />
  );
}
