import { createFileRoute } from '@tanstack/react-router';

import { LynxUsfmPocPage } from '@/features/lynx/components/LynxUsfmPocPage';

export const Route = createFileRoute('/_authenticated/lynx-usfm')({
  component: LynxUsfmPocPage,
});
