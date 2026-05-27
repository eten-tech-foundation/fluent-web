import { createFileRoute, redirect } from '@tanstack/react-router';

import { AcceptInvitationPage } from '@/features/auth/AcceptInvitationPage';

export const Route = createFileRoute('/accept-invitation')({
  beforeLoad: ({ context, location }) => {
    if (context.auth.isLoading) return;

    // Ensure the user is actually authenticated (by the magic link)
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { returnTo: location.href },
      });
    }
  },
  component: AcceptInvitationPage,
});
