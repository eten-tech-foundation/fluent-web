import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { UsersWrapper } from '@/features/users/components/UsersWrapper';
import { modalSchema } from '@/lib/modal-schema';
import { UserRole } from '@/lib/types';

const userSearchSchema = z.object({
  modal: modalSchema.optional(),
  userId: z.number().optional(),
});

export const Route = createFileRoute('/_authenticated/users/')({
  beforeLoad: ({ context }) => {
    if (context.auth.role !== UserRole.PROJECT_MANAGER) {
      throw redirect({ to: '/' });
    }
  },
  validateSearch: userSearchSchema,
  component: UsersWrapper,
});
