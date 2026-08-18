import type { VerseMarkers, VerseParagraph } from '@/lib/types';

import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

export type { VerseMarkers, VerseParagraph };

/** A verse as the drafting surface holds it: one row of `translated_verses`. */
export interface PericopeVerseText {
  verseNumber: number;
  text: string;
  markers: VerseMarkers | null;
}

const USJ_TYPE = 'USJ';
const USJ_VERSION = '3.1';
const DEFAULT_PARAGRAPH_MARKER = 'p';

/**
 * Builds the USJ document the editor renders for one pericope.
 *
 * A verse with stored markers opens its own paragraph (offset 0) and splits at mid-text offsets;
 * a verse with none continues whatever paragraph is current, exactly as the USFM export renders
 * legacy rows. The offsets are positions in `text`, which is the same trimmed string the save
 * path derives, so a slice here and a slice in the export agree character for character.
 */
export function pericopeVersesToUsj(
  verses: PericopeVerseText[],
  chapterNumber: number,
  bookCode?: string
): Usj {
  const content: MarkerObject[] = [{ type: 'chapter', marker: 'c', number: String(chapterNumber) }];
  let para: MarkerObject | undefined;

  const openPara = (marker: string): void => {
    para = { type: 'para', marker, content: [] };
    content.push(para);
  };

  verses.forEach(verse => {
    const paragraphs = verse.markers?.paragraphs ?? [];
    const opening = paragraphs.find(paragraph => paragraph.offset === 0);
    if (opening) openPara(opening.marker);
    // The chapter's first verse carries no marker of its own: the classic default paragraph.
    else if (!para) openPara(DEFAULT_PARAGRAPH_MARKER);

    const sid = bookCode ? `${bookCode} ${chapterNumber}:${verse.verseNumber}` : undefined;
    para?.content?.push({
      type: 'verse',
      marker: 'v',
      number: String(verse.verseNumber),
      ...(sid ? { sid } : {}),
    });

    let cursor = 0;
    for (const split of paragraphs.filter(paragraph => paragraph.offset > 0)) {
      const slice = verse.text.slice(cursor, split.offset);
      if (slice !== '') para?.content?.push(slice);
      openPara(split.marker);
      cursor = split.offset;
    }
    const rest = verse.text.slice(cursor);
    // An empty verse still needs its marker, so the translator can click into it and type.
    if (rest !== '') para?.content?.push(rest);
  });

  return {
    type: USJ_TYPE,
    version: USJ_VERSION,
    content,
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

/** One stretch of a verse inside a single paragraph, before empty stretches are dropped. */
interface VerseSegment {
  text: string;
  paraMarker: string;
  openedByVerse: boolean;
}

/**
 * Save-path derivation: flattens the editor's USJ back to one row per verse — the plain string
 * `translated_verses.content` stores, plus the paragraph markers fluent-api#264 stores beside it.
 *
 * A verse split across paragraphs rejoins with a single space, and each split becomes a
 * `{ marker, offset }` entry pointing at where the next paragraph begins in that joined string.
 * A verse whose marker is the first thing in its paragraph owns the paragraph: entry at offset 0.
 * Segments are trimmed (canonical USJ carries a structural space before the next verse marker
 * that is not part of the verse's own text), so offsets are positions in the exact string that is
 * saved. A paragraph holding no text is not persisted — there is no character to anchor it to.
 */
export function usjToPericopeVerses(usj: Usj): PericopeVerseText[] {
  const order: number[] = [];
  const segments = new Map<number, VerseSegment[]>();
  let currentVerse: number | undefined;

  for (const node of usj.content) {
    if (typeof node === 'string') continue;
    const marker = node as MarkerObject;
    if (marker.type !== 'para' || !marker.content) continue;
    const paraMarker = marker.marker ?? DEFAULT_PARAGRAPH_MARKER;

    let buffer = '';
    let paraHasPriorContent = false;
    // A verse continuing from the previous paragraph never owns this one; only a verse marker
    // seen at the paragraph's start (below) flips this on.
    let currentOpenedPara = false;

    const flush = (): void => {
      if (currentVerse === undefined) return;
      segments.get(currentVerse)?.push({
        text: buffer.trim(),
        paraMarker,
        openedByVerse: currentOpenedPara,
      });
      buffer = '';
    };

    for (const item of marker.content) {
      if (typeof item === 'string') {
        buffer += item;
        continue;
      }
      if (item.type === 'verse') {
        // Buffered text normally belongs to the verse before this one, which is what stops this
        // verse from owning the paragraph. Before the document's first verse marker there is no
        // such verse: the editor lets the caret sit in front of it, and that text joins the verse
        // that follows (the flush below keeps the buffer, having no verse to file it under). The
        // verse still starts the paragraph, so it keeps its offset-zero marker.
        const opensPara =
          !paraHasPriorContent && (currentVerse === undefined || buffer.trim() === '');
        flush();
        paraHasPriorContent = true;
        currentOpenedPara = opensPara;
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
    flush();
  }

  return order.map(verseNumber => {
    const records = segments.get(verseNumber) ?? [];
    const kept = records.filter(record => record.text !== '');
    const paragraphs: VerseParagraph[] = [];

    // Which paragraph offset 0 belongs to: the one the verse's visible text actually starts in,
    // not the one its marker happens to sit in. Pressing Enter right after a verse marker leaves
    // an empty paragraph holding nothing but the marker; that paragraph is not persisted (there is
    // no character to anchor it to), so the paragraph the text landed in is the one the verse
    // opens. A verse with no text at all keeps its own paragraph — its marker is still a position
    // the editor can rebuild.
    const firstTextIndex = records.findIndex(record => record.text !== '');
    const opener = records[Math.max(firstTextIndex, 0)];
    if (records.length > 0 && (firstTextIndex > 0 || opener.openedByVerse)) {
      paragraphs.push({ marker: opener.paraMarker, offset: 0 });
    }
    let offset = 0;
    kept.forEach((record, index) => {
      if (index > 0) {
        offset += 1; // the joining space
        paragraphs.push({ marker: record.paraMarker, offset });
      }
      offset += record.text.length;
    });

    return {
      verseNumber,
      text: kept.map(record => record.text).join(' '),
      markers: paragraphs.length > 0 ? { paragraphs } : null,
    };
  });
}

function markersKey(markers: VerseMarkers | null): string {
  return JSON.stringify(markers?.paragraphs ?? null);
}

/**
 * The verses whose text or paragraph markers actually changed, so the drafting surface only
 * writes what moved. Markers count as a change on their own: a translator pressing Enter without
 * touching a word still has to reach the server, and every upsert must carry the verse's full
 * markers because the API overwrites the stored value with whatever the request says
 * (fluent-api#264 nulls it when omitted). A verse missing from `next` is reported as emptied
 * rather than dropped: clearing all of a verse's text is a real edit.
 */
export function changedVerses(
  previous: PericopeVerseText[],
  next: PericopeVerseText[]
): PericopeVerseText[] {
  const nextByNumber = new Map(next.map(verse => [verse.verseNumber, verse]));
  const changed: PericopeVerseText[] = [];

  for (const before of previous) {
    const after = nextByNumber.get(before.verseNumber);
    const text = after?.text ?? '';
    const markers = after?.markers ?? null;
    if (before.text !== text || markersKey(before.markers) !== markersKey(markers)) {
      changed.push({ verseNumber: before.verseNumber, text, markers });
    }
  }

  return changed;
}
