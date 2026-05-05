import { createRouter } from '@tanstack/react-router';

import { type RouterContext } from '@/lib/router-context';
import { routeTree } from '@/routeTree.gen';

import { type ProjectItem, type User } from './types';

export const router = createRouter({
  routeTree,
  context: {
    auth: {
      isAuthenticated: false,
      isLoading: true,
      loginWithRedirect: async () => {},
    } satisfies RouterContext['auth'],
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface HistoryState {
    projectItem?: ProjectItem;
    user?: User;
  }
}
