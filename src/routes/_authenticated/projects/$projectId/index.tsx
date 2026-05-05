import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ProjectDetailWrapper } from '@/features/projects/components/ProjectDetailWrapper';
import { modalSchema } from '@/lib/modal-schema';

const projectDetailSearchSchema = z.object({
  modal: modalSchema.optional(),
});

export const Route = createFileRoute('/_authenticated/projects/$projectId/')({
  validateSearch: projectDetailSearchSchema,
  component: ProjectDetailWrapper,
});
