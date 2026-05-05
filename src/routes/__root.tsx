import { createRootRouteWithContext } from '@tanstack/react-router';
import { z } from 'zod';

import { NotFoundComponent } from '@/features/root/NotFoundComponent';
import { RootComponent } from '@/features/root/RootComponent';
import { RootErrorComponent } from '@/features/root/RootErrorComponent';
import { modalSchema } from '@/lib/modal-schema';
import { type RouterContext } from '@/lib/router-context';

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: z.object({
    modal: modalSchema.optional(),
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});
