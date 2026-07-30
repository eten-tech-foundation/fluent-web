import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

export interface DerivedVerse {
  chapterNumber: number;
  verseNumber: number;
  text: string;
}

/**
 * Save-path derivation: walks a chapter USJ and extracts per-verse plain text
 * (the shape of `translated_verses.content`). A verse spanning multiple
 * paragraphs joins its segments with a single space — paragraph structure
 * lives in the chapter USJ, not in verse rows.
 */
export function usjToVerses(usj: Usj): DerivedVerse[] {
  const verses: DerivedVerse[] = [];
  // One text chunk per paragraph the verse touches; joined with a space at the end.
  const chunks = new Map<DerivedVerse, string[]>();
  let chapterNumber = 0;
  let currentVerse: DerivedVerse | null = null;

  for (const node of usj.content) {
    if (typeof node === 'string') continue;
    const marker = node as MarkerObject;
    if (marker.type === 'chapter') {
      chapterNumber = Number.parseInt(marker.number ?? '0', 10);
      currentVerse = null;
      continue;
    }
    if (marker.type !== 'para' || !marker.content) continue;

    let paraBuffer = '';
    const flushBuffer = (): void => {
      if (currentVerse && paraBuffer.trim() !== '') {
        chunks.get(currentVerse)?.push(paraBuffer.trim());
      }
      paraBuffer = '';
    };

    for (const item of marker.content) {
      if (typeof item === 'string') {
        paraBuffer += item;
        continue;
      }
      if (item.type === 'verse') {
        flushBuffer();
        currentVerse = {
          chapterNumber,
          verseNumber: Number.parseInt(item.number ?? '0', 10),
          text: '',
        };
        verses.push(currentVerse);
        chunks.set(currentVerse, []);
      }
    }
    flushBuffer();
  }

  for (const verse of verses) {
    verse.text = (chunks.get(verse) ?? []).join(' ');
  }
  return verses;
}
