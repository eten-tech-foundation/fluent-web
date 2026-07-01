export interface AssemblyVerse {
  bookCode: string;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
  content: string | null;
}

/**
 * Client-side mirror of fluent-api's `generateUSFMText` (src/lib/usfm-converter.ts)
 * so the browser derives the exact same canonical USFM the export endpoint emits.
 */
export function buildUsfmFromVerses(verses: AssemblyVerse[]): string {
  if (verses.length === 0) {
    return '';
  }

  const { bookCode, bookName } = verses[0];
  let usfmText = `\\id ${bookCode}\n\\h ${bookName}\n\\mt ${bookName}\n`;

  let currentChapter: number | null = null;

  for (const verse of verses) {
    if (currentChapter !== verse.chapterNumber) {
      usfmText += `\\c ${verse.chapterNumber}\n\\p\n`;
      currentChapter = verse.chapterNumber;
    }
    usfmText += `\\v ${verse.verseNumber} ${verse.content ?? ''}\n`;
  }

  return `${usfmText}\n`;
}
