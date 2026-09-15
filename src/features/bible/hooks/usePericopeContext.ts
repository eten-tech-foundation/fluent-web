import { useMemo } from 'react';

import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import { targetTextQueryOptions } from '@/features/bible/hooks/useBibleTarget';
import { bibleTextQueryOptions } from '@/features/bible/hooks/useBibleText';
import { type PericopeGroup, type ProjectItem, type Source, type TargetVerse } from '@/lib/types';

export interface PericopeContextChapter {
  sourceVerses: Source[];
  targetVerses: TargetVerse[];
  isLoading: boolean;
  isError: boolean;
  sourceIsLoading: boolean;
  sourceIsError: boolean;
}

interface UsePericopeContextProps {
  projectItem: ProjectItem;
  pericopes: PericopeGroup[] | undefined;
  enabled: boolean;
}

// useQueries structurally shares this combined array, so unrelated renders do not rebuild
// the projected chapter map or its refetch callback.
function combineChapterQueries<T>(
  queries: Array<UseQueryResult<T, Error>>
): Array<Pick<UseQueryResult<T, Error>, 'data' | 'error' | 'isFetching' | 'isError' | 'refetch'>> {
  return queries.map(({ data, error, isFetching, isError, refetch }) => ({
    data,
    error,
    isFetching,
    isError,
    refetch,
  }));
}

/**
 * The adjacent chapters are read-only context. Keep their requests and data separate from the
 * active chapter's draft so a late response cannot reinitialize an editor or its save state.
 */
export function usePericopeContext({ projectItem, pericopes, enabled }: UsePericopeContextProps) {
  const references = useMemo(() => {
    const byChapter = new Map<number, Set<number>>();
    if (!enabled) return byChapter;

    for (const group of pericopes ?? []) {
      if (!group.verses.some(verse => verse.chapterNumber === projectItem.chapterNumber)) continue;
      for (const verse of group.verses) {
        if (verse.chapterNumber === projectItem.chapterNumber) continue;
        const numbers = byChapter.get(verse.chapterNumber) ?? new Set<number>();
        numbers.add(verse.verseNumber);
        byChapter.set(verse.chapterNumber, numbers);
      }
    }
    return byChapter;
  }, [enabled, pericopes, projectItem.chapterNumber]);

  const chapterNumbers = useMemo(
    () => Array.from(references.keys()).sort((a, b) => a - b),
    [references]
  );
  const sourceQueries = useQueries({
    queries: chapterNumbers.map(chapterNumber =>
      bibleTextQueryOptions(projectItem.bibleId, projectItem.bookId, chapterNumber)
    ),
    combine: combineChapterQueries,
  });
  const targetQueries = useQueries({
    queries: chapterNumbers.map(chapterNumber =>
      targetTextQueryOptions(projectItem.projectUnitId, projectItem.bookId, chapterNumber)
    ),
    combine: combineChapterQueries,
  });

  return useMemo(() => {
    const chapters = new Map<number, PericopeContextChapter>();
    let error: Error | null = null;
    for (const [index, chapterNumber] of chapterNumbers.entries()) {
      const sourceQuery = sourceQueries[index];
      const targetQuery = targetQueries[index];
      error ??= sourceQuery.error ?? targetQuery.error;
      const requestedVerses = references.get(chapterNumber);
      const sourceVerses = (sourceQuery.data ?? [])
        .filter(verse => requestedVerses?.has(verse.verseNumber))
        .map(({ id, verseNumber, text }) => ({ id, verseNumber, text }))
        .sort((a, b) => a.verseNumber - b.verseNumber);

      // Keep raw cached rows intact: translations join to source IDs, not translated row IDs
      // or verse numbers, which repeat in every chapter.
      const targetsBySourceId = new Map(
        (targetQuery.data ?? []).map(verse => [verse.bibleTextId, verse])
      );
      const targetVerses = sourceVerses.flatMap(source => {
        const target = targetsBySourceId.get(source.id);
        return target
          ? [
              {
                id: target.id,
                verseNumber: source.verseNumber,
                content: target.content,
                markers: target.markers ?? null,
              },
            ]
          : [];
      });
      const sourceIsLoading = sourceQuery.isFetching && !sourceQuery.data;
      chapters.set(chapterNumber, {
        sourceVerses,
        targetVerses,
        sourceIsLoading,
        sourceIsError: sourceQuery.isError,
        isLoading: sourceIsLoading || (targetQuery.isFetching && !targetQuery.data),
        isError: sourceQuery.isError || targetQuery.isError,
      });
    }

    return {
      chapters,
      isLoading: Array.from(chapters.values()).some(chapter => chapter.isLoading),
      isError: error !== null,
      error,
      refetch: () =>
        Promise.all([...sourceQueries, ...targetQueries].map(query => query.refetch())),
    };
  }, [chapterNumbers, references, sourceQueries, targetQueries]);
}
