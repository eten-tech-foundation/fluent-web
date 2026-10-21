import type { VerseHeading, VerseMarkers, VerseParagraph } from '@/lib/types';

import { PARAGRAPH_MARKER } from './block-types';
import { isHeadingMarker } from './heading-markers';

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

/**
 * The paragraph a verse opens for its text: its offset-0 marker, or a `p` after its headings.
 * Without either, the verse continues the paragraph before it.
 */
function ownParagraph(verse: PericopeVerseText): string | undefined {
  const opening = verse.markers?.paragraphs?.find(paragraph => paragraph.offset === 0);
  if (opening) return opening.marker;
  return verse.markers?.headings?.length ? PARAGRAPH_MARKER : undefined;
}

/**
 * Builds the USJ document the editor renders for one pericope.
 *
 * A verse with stored markers opens its own paragraph (offset 0) and splits at mid-text offsets;
 * a verse with none continues whatever paragraph is current, exactly as the USFM export renders
 * legacy rows. The offsets are positions in `text`, which is the same trimmed string the save
 * path derives, so a slice here and a slice in the export agree character for character.
 *
 * `continuedParagraph` is the paragraph the chapter has open where a later pericope starts
 * (`paragraphOpenBefore`). Pericope View builds one document per pericope, so without it a first
 * verse that only continues a Poetry line would open a new `p`.
 */
export function pericopeVersesToUsj(
  verses: PericopeVerseText[],
  chapterNumber: number,
  bookCode?: string,
  continuedParagraph?: string
): Usj {
  const content: MarkerObject[] = [{ type: 'chapter', marker: 'c', number: String(chapterNumber) }];
  let para: MarkerObject | undefined;

  const openPara = (marker: string): void => {
    para = { type: 'para', marker, content: [] };
    content.push(para);
  };

  verses.forEach(verse => {
    const headings = verse.markers?.headings ?? [];
    for (const heading of headings) {
      content.push({ type: 'para', marker: heading.marker, content: [heading.text] });
    }
    const paragraphs = verse.markers?.paragraphs ?? [];
    const own = ownParagraph(verse);
    if (own) openPara(own);
    // The chapter's first verse carries no marker of its own: the classic default paragraph. A
    // later pericope's first verse continues the paragraph the chapter has open there.
    else if (!para) openPara(continuedParagraph ?? PARAGRAPH_MARKER);

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
 * The paragraph still open after `verses`: the one their document ends in. It is read off
 * `pericopeVersesToUsj` rather than worked out again, so the two can't disagree about where a
 * paragraph opens.
 */
export function openParagraphAfter(verses: PericopeVerseText[]): string | undefined {
  if (verses.length === 0) return undefined;
  const last = pericopeVersesToUsj(verses, 0).content.at(-1);
  return typeof last === 'object' ? last.marker : undefined;
}

/**
 * The paragraph the chapter has open where a pericope starting at `verseNumber` begins, from the
 * chapter's rows. Verses ahead of it with no row yet sit in the chapter's default paragraph.
 */
export function paragraphOpenBefore(
  rows: PericopeVerseText[],
  verseNumber: number
): string | undefined {
  const before = rows
    .filter(row => row.verseNumber < verseNumber)
    .sort((a, b) => a.verseNumber - b.verseNumber);
  return openParagraphAfter(before) ?? (verseNumber > 1 ? PARAGRAPH_MARKER : undefined);
}

/**
 * What a pericope's first verse continues: `open`, the paragraph the chapter has open there,
 * unless the verse opens a paragraph of its own. `usjToPericopeVerses` reads the document's first
 * paragraph as a continuation only when it was built as one.
 */
export function continuedParagraphOf(
  verses: PericopeVerseText[],
  open: string | undefined
): string | undefined {
  const first = verses.at(0);
  return first && !ownParagraph(first) ? open : undefined;
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
  /** Which of the document's paragraphs it is in, counting from 0. */
  paraIndex: number;
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
 * Words in a paragraph that no verse owns yet (under a heading, or above the chapter's first
 * verse) open the verse that follows, rather than being dropped.
 *
 * With `continuedParagraph` (`continuedParagraphOf` the document's verses), the document's first
 * paragraph is the one the chapter already had open, not a break: while the first verse's text
 * starts in it and it keeps that marker, the verse is saved without an opening marker, as it was
 * stored.
 */
export function usjToPericopeVerses(usj: Usj, continuedParagraph?: string): PericopeVerseText[] {
  const order: number[] = [];
  const segments = new Map<number, VerseSegment[]>();
  const headings = new Map<number, VerseHeading[]>();
  let pendingHeadings: VerseHeading[] = [];
  let pendingSegments: VerseSegment[] = [];
  let currentVerse: number | undefined;
  let paraIndex = -1;

  for (const node of usj.content) {
    if (typeof node === 'string') continue;
    const marker = node as MarkerObject;
    if (marker.type !== 'para') continue;
    paraIndex += 1;
    if (!marker.content) continue;
    let paraMarker = marker.marker ?? PARAGRAPH_MARKER;
    let body = marker.content;
    if (isHeadingMarker(paraMarker)) {
      // Some imported documents omit the body paragraph and nest a verse in the heading.
      // Only the prefix is heading text; scripture after the milestone remains verse text.
      const firstVerse = body.findIndex(item => typeof item !== 'string' && item.type === 'verse');
      const prefix = firstVerse < 0 ? body : body.slice(0, firstVerse);
      const text = markerText({ ...marker, content: prefix }).trim();
      if (text) pendingHeadings.push({ marker: paraMarker, text });
      currentVerse = undefined;
      if (firstVerse < 0) continue;
      body = body.slice(firstVerse);
      paraMarker = PARAGRAPH_MARKER;
    }

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
        paraIndex,
      });
      buffer = '';
    };

    for (const item of body) {
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
        if (pendingHeadings.length > 0) {
          headings.set(currentVerse, pendingHeadings);
          pendingHeadings = [];
        }
        if (!segments.has(currentVerse)) {
          segments.set(currentVerse, []);
          order.push(currentVerse);
        }
        segments.get(currentVerse)?.push(...pendingSegments);
        pendingSegments = [];
        continue;
      }
      // Character-level markers (\nd, \add …) contribute their text to the verse.
      if (!NON_TEXT_MARKER_TYPES.has(item.type)) buffer += markerText(item);
    }
    // Words with no verse yet wait for the next one, which they open.
    if (currentVerse === undefined && buffer.trim() !== '') {
      pendingSegments.push({ text: buffer.trim(), paraMarker, openedByVerse: true, paraIndex });
    }
    flush();
  }

  return order.map((verseNumber, verseIndex) => {
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
    const opensParagraph = records.length > 0 && (firstTextIndex > 0 || opener.openedByVerse);
    // A later pericope's first verse sitting in the paragraph the chapter already had open there
    // made no break of its own.
    const continuesChapter =
      opensParagraph &&
      verseIndex === 0 &&
      !headings.has(verseNumber) &&
      opener.paraIndex === 0 &&
      opener.paraMarker === continuedParagraph;
    if (opensParagraph && !continuesChapter) {
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
      markers:
        paragraphs.length > 0 || headings.has(verseNumber)
          ? {
              ...(paragraphs.length > 0 ? { paragraphs } : {}),
              ...(headings.has(verseNumber) ? { headings: headings.get(verseNumber) } : {}),
            }
          : null,
    };
  });
}

function markersKey(markers: VerseMarkers | null): string {
  return JSON.stringify([markers?.paragraphs ?? null, markers?.headings ?? null]);
}

/**
 * The verses whose text or paragraph markers actually changed, so the drafting surface only
 * writes what moved. Markers count as a change on their own: a translator pressing Enter without
 * touching a word still has to reach the server, and every upsert must carry the verse's full
 * markers because the API overwrites the stored value with whatever the request says
 * (fluent-api#264 nulls it when omitted). A verse missing from `next` is reported as emptied
 * rather than dropped: clearing all of a verse's text is a real edit.
 *
 * Only the verses in `previous` are looked at, so a verse `next` introduces is not reported. The
 * caller is a pericope whose verse set is fixed by the document the editor was loaded with, and
 * the editor cannot invent a verse marker; a caller where it can would need more than this.
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
