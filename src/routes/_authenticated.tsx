import { createFileRoute } from '@tanstack/react-router';

import { AuthenticatedLayout } from '@/features/auth/AuthenticatedLayout';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    // Don't do anything while auth is still loading
    if (context.auth.isLoading) {
      return;
    }

    // If not authenticated, redirect to Auth0 login
    if (!context.auth.isAuthenticated) {
      // This triggers a full browser redirect to Auth0
      void context.auth.loginWithRedirect({
        appState: {
          returnTo: window.location.pathname + window.location.search,
        },
      });
    }
  },
  component: AuthenticatedLayout,
});
