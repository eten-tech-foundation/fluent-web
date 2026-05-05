import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { UsersWrapper } from '@/features/users/components/UsersWrapper';
import { modalSchema } from '@/lib/modal-schema';

const userSearchSchema = z.object({
  modal: modalSchema.optional(),
  userId: z.number().optional(),
});

export const Route = createFileRoute('/_authenticated/users/')({
  validateSearch: userSearchSchema,
  component: UsersWrapper,
});
