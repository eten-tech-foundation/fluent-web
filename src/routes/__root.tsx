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
    // Added for issue #75: tells SettingsModal to pre-expand the AI accordion
    // when the user arrives from the onboarding toast "Tell me more" button
    openAiInfo: z.boolean().optional(),
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});
