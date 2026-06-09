import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { type AuthContext } from '@/lib/router-context';
import { UserRole } from '@/lib/types';
import { Route as AuthenticatedRoute } from '@/routes/_authenticated';
import { Route as UsersRoute } from '@/routes/_authenticated/users/index';

interface GuardArgs {
  context: { auth: AuthContext };
  location: { href: string };
}
type Guard = (args: GuardArgs) => unknown;
interface RedirectShape {
  options?: { to?: string; search?: { returnTo?: string } };
}

const authContext = (overrides: Partial<AuthContext> = {}): AuthContext => ({
  isAuthenticated: false,
  isLoading: false,
  role: null,
  ...overrides,
});

// The guards live inline on the route definitions. We cast to the narrow shape
// they actually read, then invoke them with a controlled context.
const authGuard = AuthenticatedRoute.options.beforeLoad as unknown as Guard;
const usersGuard = UsersRoute.options.beforeLoad as unknown as Guard;

/** Run a guard and return the thrown redirect, or null if it passed through. */
function captureRedirect(guard: Guard, args: GuardArgs): unknown {
  try {
    guard(args);
    return null;
  } catch (thrown) {
    return thrown;
  }
}

describe('_authenticated route guard', () => {
  it('does nothing while auth is still loading', () => {
    const thrown = captureRedirect(authGuard, {
      context: { auth: authContext({ isLoading: true }) },
      location: { href: '/projects' },
    });
    expect(thrown).toBeNull();
  });

  it('redirects unauthenticated users to /login with the current href as returnTo', () => {
    const thrown = captureRedirect(authGuard, {
      context: { auth: authContext({ isAuthenticated: false }) },
      location: { href: '/projects/42' },
    });
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as RedirectShape).options?.to).toBe('/login');
    expect((thrown as RedirectShape).options?.search?.returnTo).toBe('/projects/42');
  });

  it('lets authenticated users through', () => {
    const thrown = captureRedirect(authGuard, {
      context: { auth: authContext({ isAuthenticated: true }) },
      location: { href: '/projects' },
    });
    expect(thrown).toBeNull();
  });
});

describe('_authenticated/users route guard', () => {
  it('redirects non-managers (translators) to the home route', () => {
    const thrown = captureRedirect(usersGuard, {
      context: { auth: authContext({ isAuthenticated: true, role: UserRole.TRANSLATOR }) },
      location: { href: '/users' },
    });
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as RedirectShape).options?.to).toBe('/');
  });

  it('lets project managers through', () => {
    const thrown = captureRedirect(usersGuard, {
      context: { auth: authContext({ isAuthenticated: true, role: UserRole.PROJECT_MANAGER }) },
      location: { href: '/users' },
    });
    expect(thrown).toBeNull();
  });
});
