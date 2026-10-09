import { useQueries } from '@tanstack/react-query';

import { parseBibleKey } from '@/features/tts/resolver/providerIdentity';

import { fetchAquiferBibleText } from './useAquiferResources';
import { fetchYouVersionChapterText } from './useYouVersion';

/** Uses the same provider query keys and plain text as the visible reference context. */
export function useReferenceChapterTexts(key: string | null, book: string, chapters: number[]) {
  const identity = key ? parseBibleKey(key) : null;
  const id = identity ? Number(identity.externalId) : null;
  const aquifer = useQueries({
    queries:
      identity?.provider === 'aquifer'
        ? chapters.map(chapter => ({
            queryKey: ['aquifer-bible-text', id, book, chapter],
            queryFn: () => fetchAquiferBibleText(id!, book, chapter),
            staleTime: 300_000,
            retry: false,
          }))
        : [],
  });
  const youversion = useQueries({
    queries:
      identity?.provider === 'youversion'
        ? chapters.map(chapter => ({
            queryKey: ['youversion-chapter-text', id, book, chapter],
            queryFn: () => fetchYouVersionChapterText(id!, book, chapter),
            staleTime: 300_000,
            retry: false,
          }))
        : [],
  });
  return new Map(
    chapters.map((chapter, index) => {
      const texts = new Map<number, string>();
      let loading = false;
      let error = false;
      if (identity?.provider === 'aquifer') {
        const result = aquifer[index];
        loading = result.isPending;
        error = result.isError;
        if (!result.isError)
          result.data?.chapters
            .find(row => row.number === chapter)
            ?.verses.forEach(verse => texts.set(verse.number, verse.text));
      } else if (identity?.provider === 'youversion') {
        const result = youversion[index];
        loading = result.isPending;
        error = result.isError;
        if (!result.isError)
          result.data?.verses.forEach(verse => texts.set(verse.verseNumber, verse.content));
      }
      return [chapter, { texts, loading, error }] as const;
    })
  );
}
