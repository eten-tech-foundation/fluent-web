import { http, HttpResponse } from 'msw';

import { config } from '@/lib/config';

const authUrl = config.api.auth_url;

/**
 * Default request handlers. Kept intentionally small — most tests register
 * their own handlers with `server.use(...)`. The defaults just keep the app
 * from exploding on the common session probe.
 */
export const handlers = [
  // better-auth session check defaults to "not signed in".
  http.get(`${authUrl}/get-session`, () => HttpResponse.json(null)),
];
