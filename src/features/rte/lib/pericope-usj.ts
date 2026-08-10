import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

/** A verse as the drafting surface holds it: one row of `translated_verses`. */
export interface PericopeVerseText {
  verseNumber: number;
  text: string;
}

const USJ_TYPE = 'USJ';
const USJ_VERSION = '3.1';

/**
 * Builds the USJ document the editor renders for one pericope.
 *
 * Verse rows carry no structure of their own, so every verse starts in the same `\p` paragraph.
 * Once the translator splits a paragraph the editor's own USJ holds that split; it is only the
 * save path that flattens back to rows (see `usjToPericopeVerses`).
 */
export function pericopeVersesToUsj(
  verses: PericopeVerseText[],
  chapterNumber: number,
  bookCode?: string
): Usj {
  const paraContent: Array<string | MarkerObject> = [];

  verses.forEach(verse => {
    const sid = bookCode ? `${bookCode} ${chapterNumber}:${verse.verseNumber}` : undefined;
    paraContent.push({
      type: 'verse',
      marker: 'v',
      number: String(verse.verseNumber),
      ...(sid ? { sid } : {}),
    });
    // An empty verse still needs its marker, so the translator can click into it and type.
    if (verse.text !== '') paraContent.push(verse.text);
  });

  return {
    type: USJ_TYPE,
    version: USJ_VERSION,
    content: [
      { type: 'chapter', marker: 'c', number: String(chapterNumber) },
      { type: 'para', marker: 'p', content: paraContent },
    ],
  } as Usj;
}

/**
 * Markers that carry structure or apparatus rather than the verse's own words. A footnote's text
 * belongs to the note, not to the sentence it hangs off, so it must not be folded into the row.
 */
const NON_TEXT_MARKER_TYPES = new Set([
  'book',
  'chapter',
  'verse',
  'note',
  'figure',
  'ms',
  'sidebar',
]);

/**
 * Every string a marker contributes, however deeply it is nested. A character marker holds a list,
 * not a single string: `\wj Holy \nd God\nd*, hear us\wj*` is three items with one nested marker.
 */
function markerText(marker: MarkerObject): string {
  if (!marker.content) return '';

  let text = '';
  for (const item of marker.content) {
    if (typeof item === 'string') text += item;
    else if (!NON_TEXT_MARKER_TYPES.has(item.type)) text += markerText(item);
  }
  return text;
}

/**
 * Save-path derivation: flattens the editor's USJ back to one plain string per verse, the shape
 * `translated_verses.content` stores.
 *
 * A verse split across paragraphs rejoins with a single space. Paragraph structure is therefore
 * *lost here*, deliberately and visibly: there is nowhere in the verse-keyed schema to put it
 * (see fluent-api#263). Trailing whitespace is trimmed per segment, because canonical USJ carries
 * a structural space before the next verse marker that is not part of the verse's own text.
 */
export function usjToPericopeVerses(usj: Usj): PericopeVerseText[] {
  const order: number[] = [];
  const segments = new Map<number, string[]>();
  let currentVerse: number | undefined;

  const push = (verseNumber: number | undefined, text: string): void => {
    if (verseNumber === undefined) return;
    const trimmed = text.trim();
    if (trimmed === '') return;
    segments.get(verseNumber)?.push(trimmed);
  };

  for (const node of usj.content) {
    if (typeof node === 'string') continue;
    const marker = node as MarkerObject;
    if (marker.type !== 'para' || !marker.content) continue;

    let buffer = '';
    for (const item of marker.content) {
      if (typeof item === 'string') {
        buffer += item;
        continue;
      }
      if (item.type === 'verse') {
        push(currentVerse, buffer);
        buffer = '';
        currentVerse = Number.parseInt(item.number ?? '0', 10);
        if (!segments.has(currentVerse)) {
          segments.set(currentVerse, []);
          order.push(currentVerse);
        }
        continue;
      }
      // Character-level markers (\nd, \add …) contribute their text to the verse.
      if (!NON_TEXT_MARKER_TYPES.has(item.type)) buffer += markerText(item);
    }
    push(currentVerse, buffer);
  }

  return order.map(verseNumber => ({
    verseNumber,
    text: (segments.get(verseNumber) ?? []).join(' '),
  }));
}

/**
 * The verses whose text actually changed, so the drafting surface only writes what moved.
 * A verse missing from `next` is reported as empty rather than dropped: the translator deleting
 * all of a verse's text is a real edit that has to reach the server.
 */
export function changedVerses(
  previous: PericopeVerseText[],
  next: PericopeVerseText[]
): PericopeVerseText[] {
  const nextByNumber = new Map(next.map(verse => [verse.verseNumber, verse.text]));

  return previous
    .map(verse => ({
      verseNumber: verse.verseNumber,
      text: nextByNumber.get(verse.verseNumber) ?? '',
    }))
    .filter(verse => {
      const before = previous.find(p => p.verseNumber === verse.verseNumber)?.text ?? '';
      return before !== verse.text;
    });
}
