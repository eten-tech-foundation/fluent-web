import { useMemo } from 'react';

import { useQueries } from '@tanstack/react-query';

import { fetchTargetText } from '@/features/bible/hooks/useBibleTarget';
import { fetchBibleText } from '@/features/bible/hooks/useBibleText';
import { type PericopeGroup, type ProjectItem, type Source, type TargetVerse } from '@/lib/types';

export interface PericopeContextChapter {
  sourceVerses: Source[];
  targetVerses: TargetVerse[];
}

interface UsePericopeContextProps {
  projectItem: ProjectItem;
  pericopes: PericopeGroup[] | undefined;
  enabled: boolean;
}

interface ContextTarget extends TargetVerse {
  bibleTextId: number;
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

  const chapterNumbers = Array.from(references.keys()).sort((a, b) => a - b);
  const queries = useQueries({
    queries: chapterNumbers.map(chapterNumber => ({
      queryKey: [
        'pericope-context',
        projectItem.projectId,
        projectItem.projectUnitId,
        projectItem.bibleId,
        projectItem.bookId,
        projectItem.chapterNumber,
        chapterNumber,
      ],
      queryFn: async () => {
        const [sourceData, targetData] = await Promise.all([
          fetchBibleText(projectItem.bibleId, projectItem.bookId, chapterNumber),
          fetchTargetText(projectItem.projectUnitId, projectItem.bookId, chapterNumber),
        ]);
        // These shared fetch functions still declare ProjectItem[] for their JSON response.
        // The chapter text endpoints return verse rows, as in TranslationLoader.
        return {
          sourceVerses: sourceData as unknown as Source[],
          targetVerses: targetData as unknown as ContextTarget[],
        };
      },
    })),
  });

  const chapters = new Map<number, PericopeContextChapter>();
  let error: Error | null = null;
  for (const [index, query] of queries.entries()) {
    error ??= query.error;
    if (!query.data) continue;
    const chapterNumber = chapterNumbers[index];
    const requestedVerses = references.get(chapterNumber);
    const sourceVerses = query.data.sourceVerses
      .filter(verse => requestedVerses?.has(verse.verseNumber))
      .map(({ id, verseNumber, text }) => ({ id, verseNumber, text }))
      .sort((a, b) => a.verseNumber - b.verseNumber);

    if (sourceVerses.length !== requestedVerses?.size) {
      error ??= new Error(`Some source verses are unavailable in chapter ${chapterNumber}`);
      continue;
    }

    // Verse numbers repeat in each chapter; translated row IDs are not source text IDs.
    const targetsBySourceId = new Map(
      query.data.targetVerses.map(verse => [verse.bibleTextId, verse])
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
    chapters.set(chapterNumber, { sourceVerses, targetVerses });
  }

  return {
    chapters,
    isLoading: queries.some(query => query.isLoading),
    isError: error !== null,
    error,
    refetch: () => Promise.all(queries.map(query => query.refetch())),
  };
}
