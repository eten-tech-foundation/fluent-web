import { createRootRouteWithContext } from '@tanstack/react-router';
import { z } from 'zod';

import { NotFoundComponent } from '@/features/root/NotFoundComponent';
import { RootComponent } from '@/features/root/RootComponent';
import { RootErrorComponent } from '@/features/root/RootErrorComponent';
import { PlaybackRegistryProvider } from '@/features/tts/registry/PlaybackRegistryProvider';
import { modalSchema } from '@/lib/modal-schema';
import { type RouterContext } from '@/lib/router-context';

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: z.object({
    modal: modalSchema.optional(),
    openAiInfo: z.boolean().optional(),
  }),
  component: () => (
    <PlaybackRegistryProvider>
      <RootComponent />
    </PlaybackRegistryProvider>
  ),
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});
