import { config } from '@/lib/config';
import type { Source } from '@/lib/types';

import type { AssemblyVerse } from './usfm-assembly';

export interface ChapterSourceParams {
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  bookCode: string;
  bookName: string;
}

/**
 * Same endpoint the drafting editor loads source verses from
 * (src/features/bible/hooks/useBibleText.ts), retyped to the actual
 * verse-text response shape.
 */
export async function fetchChapterVerses(params: ChapterSourceParams): Promise<AssemblyVerse[]> {
  const { bibleId, bookId, chapterNumber, bookCode, bookName } = params;
  const response = await fetch(
    `${config.api.url}/bibles/${bibleId}/books/${bookId}/chapters/${chapterNumber}/texts`,
    {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch chapter text (${response.status})`);
  }

  const verses = (await response.json()) as Source[];
  return verses.map(verse => ({
    bookCode,
    bookName,
    chapterNumber,
    verseNumber: verse.verseNumber,
    content: verse.text,
  }));
}
