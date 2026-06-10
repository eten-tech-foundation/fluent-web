import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { RoleBasedHomePage } from '@/components/RoleBasedHomePage';

export const Route = createFileRoute('/_authenticated/')({
  // The dashboard tab lives in the URL so tab switches are real history
  // entries — Back from My History returns to My Work, not out of the page.
  validateSearch: z.object({
    tab: z.enum(['my-work', 'my-history']).optional(),
  }),
  component: RoleBasedHomePage,
});
