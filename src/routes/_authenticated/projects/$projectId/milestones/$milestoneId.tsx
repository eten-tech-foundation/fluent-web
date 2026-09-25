import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

// Temporary mock wrapper for Milestone Detail
import { MilestoneDetailWrapper } from '@/features/projects/components/MilestoneDetailWrapper';

const searchSchema = z.object({
  modal: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/projects/$projectId/milestones/$milestoneId')(
  {
    validateSearch: searchSchema,
    component: MilestoneDetailWrapper,
  }
);
