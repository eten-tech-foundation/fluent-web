import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { type AuthContext } from '@/lib/router-context';
import { Route as AuthenticatedRoute } from '@/routes/_authenticated';
import { Route as UsersRoute } from '@/routes/_authenticated/users/index';
import { Route as LoginRoute } from '@/routes/login';

interface GuardArgs {
  context: { auth: AuthContext };
  location: { href: string };
  search?: { returnTo?: string };
}
type Guard = (args: GuardArgs) => unknown;
interface RedirectShape {
  options?: { to?: string; href?: string; search?: { returnTo?: string } };
}

const authContext = (overrides: Partial<AuthContext> = {}): AuthContext => ({
  isAuthenticated: false,
  isLoading: false,
  ...overrides,
});

// The guards live inline on the route definitions. We cast to the narrow shape
// they actually read, then invoke them with a controlled context.
const authGuard = AuthenticatedRoute.options.beforeLoad as unknown as Guard;
const usersGuard = UsersRoute.options.beforeLoad as unknown as Guard;
const loginGuard = LoginRoute.options.beforeLoad as unknown as Guard;

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

describe('/login route guard', () => {
  it('does nothing while auth is still loading', () => {
    const thrown = captureRedirect(loginGuard, {
      context: { auth: authContext({ isLoading: true, isAuthenticated: true }) },
      location: { href: '/login' },
      search: {},
    });
    expect(thrown).toBeNull();
  });

  it('lets unauthenticated users through to the login form', () => {
    const thrown = captureRedirect(loginGuard, {
      context: { auth: authContext({ isAuthenticated: false }) },
      location: { href: '/login' },
      search: {},
    });
    expect(thrown).toBeNull();
  });

  it('redirects authenticated users to the app home when no returnTo is present', () => {
    const thrown = captureRedirect(loginGuard, {
      context: { auth: authContext({ isAuthenticated: true }) },
      location: { href: '/login' },
      search: {},
    });
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as RedirectShape).options?.href).toBe('/');
  });

  it('redirects authenticated users to an internal returnTo path', () => {
    const thrown = captureRedirect(loginGuard, {
      context: { auth: authContext({ isAuthenticated: true }) },
      location: { href: '/login' },
      search: { returnTo: '/projects/42' },
    });
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as RedirectShape).options?.href).toBe('/projects/42');
  });

  it('falls back to the app home for non-internal returnTo targets', () => {
    for (const returnTo of ['https://evil.example/phish', '//evil.example', '/\\evil.example']) {
      const thrown = captureRedirect(loginGuard, {
        context: { auth: authContext({ isAuthenticated: true }) },
        location: { href: '/login' },
        search: { returnTo },
      });
      expect(isRedirect(thrown)).toBe(true);
      expect((thrown as RedirectShape).options?.href).toBe('/');
    }
  });

  it('never redirects back into the login page itself', () => {
    for (const returnTo of ['/login', '/login?returnTo=%2F', '/login/nested']) {
      const thrown = captureRedirect(loginGuard, {
        context: { auth: authContext({ isAuthenticated: true }) },
        location: { href: '/login' },
        search: { returnTo },
      });
      expect(isRedirect(thrown)).toBe(true);
      expect((thrown as RedirectShape).options?.href).toBe('/');
    }
  });
});

describe('_authenticated/users route guard', () => {
  it('redirects when user cannot view users', () => {
    const thrown = captureRedirect(usersGuard, {
      context: { auth: authContext({ isAuthenticated: true, canViewUsers: false }) },
      location: { href: '/users' },
    });
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as RedirectShape).options?.to).toBe('/');
  });

  it('lets users with view permission through', () => {
    const thrown = captureRedirect(usersGuard, {
      context: { auth: authContext({ isAuthenticated: true, canViewUsers: true }) },
      location: { href: '/users' },
    });
    expect(thrown).toBeNull();
  });
});
