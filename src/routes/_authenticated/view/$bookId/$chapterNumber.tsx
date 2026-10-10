import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ChapterLoadError } from '@/features/bible/components/ChapterLoadError';
import DraftingPage from '@/features/bible/components/DraftingPage';
import { translationLoader } from '@/features/bible/TranslationLoader';

export const Route = createFileRoute('/_authenticated/view/$bookId/$chapterNumber')({
  validateSearch: z.object({
    t: z.string().optional(),
  }),
  // Assignments can share a URL path. Isolate each navigation's pending loader result.
  loaderDeps: ({ search: { t } }) => ({ t }),
  loader: translationLoader,
  errorComponent: ChapterLoadError,
  component: DraftingPage,
  gcTime: 0,
  staleTime: 0,
});
