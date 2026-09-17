import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { OrganizationDetailWrapper } from '@/features/organizations/components/OrganizationDetailWrapper';
import { modalSchema } from '@/lib/modal-schema';

const organizationDetailSearchSchema = z.object({
  modal: modalSchema.optional(),
});

export const Route = createFileRoute('/_authenticated/organizations/$orgId/')({
  beforeLoad: ({ context, params }) => {
    if (!context.auth.canManageOrgs) {
      throw redirect({ to: '/' });
    }
    const orgId = Number(params.orgId);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      throw redirect({ to: '/organizations' });
    }
  },
  validateSearch: organizationDetailSearchSchema,
  component: OrganizationDetailWrapper,
});
