import { createFileRoute, redirect } from '@tanstack/react-router';

import { AuthenticatedLayout } from '@/features/auth/AuthenticatedLayout';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    // Don't do anything while auth is still loading
    if (context.auth.isLoading) {
      return;
    }

    // If not authenticated, redirect to login
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { returnTo: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
});
