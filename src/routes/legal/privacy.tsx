import { createFileRoute } from '@tanstack/react-router';

import { PrivacyPolicyPage } from '@/features/legal/components/PrivacyPolicyPage';

export const Route = createFileRoute('/legal/privacy')({
  component: PrivacyPolicyPage,
});
