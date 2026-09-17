import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { OrganizationDetailWrapper } from '@/features/organizations/components/OrganizationDetailWrapper';
import { modalSchema } from '@/lib/modal-schema';

const organizationDetailSearchSchema = z.object({
  modal: modalSchema.optional(),
});

export const Route = createFileRoute('/_authenticated/organizations/$orgId/')({
  beforeLoad: ({ context }) => {
    if (!context.auth.canManageOrgs) {
      throw redirect({ to: '/' });
    }
  },
  validateSearch: organizationDetailSearchSchema,
  component: OrganizationDetailWrapper,
});
