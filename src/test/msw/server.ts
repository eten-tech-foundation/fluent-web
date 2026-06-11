import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/** Shared MSW server. Tests override per-case with `server.use(...)`. */
export const server = setupServer(...handlers);
