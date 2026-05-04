import { createFileRoute } from '@tanstack/react-router';

import { RoleBasedHomePage } from '@/components/RoleBasedHomePage';

export const Route = createFileRoute('/_authenticated/')({
  component: RoleBasedHomePage,
});
