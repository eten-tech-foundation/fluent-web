import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ProjectsWrapper } from '@/features/projects/components/index';
import { modalSchema } from '@/lib/modal-schema';

const projectSearchSchema = z.object({
  modal: modalSchema.optional(),
});

export const Route = createFileRoute('/_authenticated/projects/')({
  validateSearch: projectSearchSchema,
  component: ProjectsWrapper,
});
