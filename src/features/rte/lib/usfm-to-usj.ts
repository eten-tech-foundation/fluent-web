import type { BookCode, MarkerContent, Usj } from '@eten-tech-foundation/scripture-utilities';

/**
 * Minimal, deterministic USFM→USJ converter for the curated V1 subset the app
 * assembles from verse rows (\id \h \mt \c \p \v + plain continuation lines).
 * The canonical converter decision is out of scope for the PoC (issue #375);
 * this keeps the editor input dependency-free and normalized (no trailing
 * newlines in text nodes, sids on chapters "GEN 1" and verses "GEN 1:1").
 */
export function usfmToUsj(usfm: string): Usj {
  const content: MarkerContent[] = [];
  let bookCode = '';
  let chapterNumber = '';
  let currentPara: { type: 'para'; marker: string; content: MarkerContent[] } | null = null;

  const flushPara = (): void => {
    if (currentPara && currentPara.content.length > 0) content.push(currentPara);
    currentPara = null;
  };

  for (const rawLine of usfm.split('\n')) {
    const line = rawLine.trimEnd();
    if (line === '') continue;

    const idMatch = /^\\id (\S+)(?: (.*))?$/.exec(line);
    if (idMatch) {
      flushPara();
      bookCode = idMatch[1];
      content.push({
        type: 'book',
        marker: 'id',
        // The curated subset always carries a canonical 3-letter code.
        code: bookCode as BookCode,
        content: idMatch[2] ? [idMatch[2]] : [],
      });
      continue;
    }

    const headerMatch = /^\\(h|mt) (.*)$/.exec(line);
    if (headerMatch) {
      flushPara();
      content.push({ type: 'para', marker: headerMatch[1], content: [headerMatch[2]] });
      continue;
    }

    const chapterMatch = /^\\c (\S+)$/.exec(line);
    if (chapterMatch) {
      flushPara();
      chapterNumber = chapterMatch[1];
      content.push({
        type: 'chapter',
        marker: 'c',
        number: chapterNumber,
        sid: `${bookCode} ${chapterNumber}`,
      });
      continue;
    }

    const paraMatch = /^\\(p|m|q\d?)$/.exec(line);
    if (paraMatch) {
      flushPara();
      currentPara = { type: 'para', marker: paraMatch[1], content: [] };
      continue;
    }

    const verseMatch = /^\\v (\S+) ?(.*)$/.exec(line);
    if (verseMatch) {
      currentPara ??= { type: 'para', marker: 'p', content: [] };
      currentPara.content.push({
        type: 'verse',
        marker: 'v',
        number: verseMatch[1],
        sid: `${bookCode} ${chapterNumber}:${verseMatch[1]}`,
      });
      const text = verseMatch[2].trim();
      if (text !== '') currentPara.content.push(text);
      continue;
    }

    // Plain continuation line: text belonging to the current paragraph/verse.
    if (!line.startsWith('\\')) {
      currentPara ??= { type: 'para', marker: 'p', content: [] };
      currentPara.content.push(line.trim());
    }
    // Markers outside the curated subset are dropped.
  }
  flushPara();

  return { type: 'USJ', version: '3.1', content };
}
