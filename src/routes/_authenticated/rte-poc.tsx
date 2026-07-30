import { createFileRoute } from '@tanstack/react-router';

import { RtePocPage } from '@/features/rte/components/RtePocPage';

export const Route = createFileRoute('/_authenticated/rte-poc')({
  component: RtePocPage,
});
