import { createFileRoute } from '@tanstack/react-router';

import { LegalLayout } from '@/features/legal/components/LegalLayout';

export const Route = createFileRoute('/legal')({
  component: LegalLayout,
});
