import { createFileRoute } from '@tanstack/react-router';

import { TermsOfUsePage } from '@/features/legal/components/TermsOfUsePage';

export const Route = createFileRoute('/legal/terms')({
  component: TermsOfUsePage,
});
