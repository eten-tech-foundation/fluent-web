import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { LoginPage } from '@/features/auth/LoginPage';
import { resolveReturnTo } from '@/features/auth/return-to';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    returnTo: z.string().optional(),
  }),
  beforeLoad: ({ context, search }) => {
    // Don't do anything while auth is still loading
    if (context.auth.isLoading) {
      return;
    }

    // Already signed in (e.g. Back button landing on /login): send the user
    // into the app instead of showing the login form again
    if (context.auth.isAuthenticated) {
      throw redirect({ href: resolveReturnTo(search.returnTo) });
    }
  },
  component: LoginPage,
});
