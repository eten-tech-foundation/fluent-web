import { RouterProvider } from '@tanstack/react-router';

import { useAuth } from '@/hooks/useAuth';
import { router } from '@/lib/router';

export function AppRouter(): React.JSX.Element {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth();
  return (
    <RouterProvider
      context={{ auth: { isAuthenticated, isLoading, loginWithRedirect } }}
      router={router}
    />
  );
}
