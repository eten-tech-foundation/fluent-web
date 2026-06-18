/**
 * Resolve a `returnTo` search param to a safe in-app navigation target.
 *
 * Only same-origin paths are allowed ("/projects/42"). Anything else —
 * absolute URLs, scheme-relative "//host", or "/\host" — falls back to the
 * app home so the login flow can't be used as an open redirect. Targets on
 * the login page itself also fall back, so redirects can't loop.
 */
export function resolveReturnTo(returnTo: string | undefined): string {
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//') || returnTo.startsWith('/\\')) {
    return '/';
  }
  const pathname = returnTo.split(/[?#]/, 1)[0];
  if (pathname === '/login' || pathname.startsWith('/login/')) {
    return '/';
  }
  return returnTo;
}
