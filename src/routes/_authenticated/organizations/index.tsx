import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { OrganizationsWrapper } from '@/features/organizations/components/OrganizationsWrapper';
import { modalSchema } from '@/lib/modal-schema';

const organizationsSearchSchema = z.object({
  modal: modalSchema.optional(),
});

export const Route = createFileRoute('/_authenticated/organizations/')({
  beforeLoad: ({ context }) => {
    if (!context.auth.canManageOrgs) {
      throw redirect({ to: '/' });
    }
  },
  validateSearch: organizationsSearchSchema,
  component: OrganizationsWrapper,
});
