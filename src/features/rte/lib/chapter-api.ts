import { config } from '@/lib/config';
import type { Source, VerseData } from '@/lib/types';

export interface ChapterParams {
  bibleId: number;
  bookId: number;
  chapterNumber: number;
}

/**
 * Same endpoint the drafting editor and the Lynx PoC load from, but keeping the
 * raw `Source` rows: the PoC save path needs each verse's `id` (= bibleTextId).
 */
export async function fetchChapterSources(params: ChapterParams): Promise<Source[]> {
  const { bibleId, bookId, chapterNumber } = params;
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
  return (await response.json()) as Source[];
}

/** Same POST the drafting editor performs per verse (useBibleTarget.ts). */
export async function postTranslatedVerse(verseData: VerseData): Promise<void> {
  const response = await fetch(`${config.api.url}/translated-verses`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verseData),
  });
  if (!response.ok) {
    throw new Error(`Failed to save verse (${response.status})`);
  }
}
