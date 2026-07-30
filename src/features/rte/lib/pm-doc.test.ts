import { describe, expect, it } from 'vitest';

import { slicePericope } from './pericope-slice';
import { annotationRanges, docToUsj, usjToDoc } from './pm-doc';
import { usfmToUsj } from './usfm-to-usj';
import { usjToVerses } from './usj-verses';

import type { RteAnnotation } from './lynx-annotations';

const USFM =
  '\\id GEN\n\\h Genesis\n\\mt Genesis\n' +
  '\\c 1\n\\p\n\\v 1 First words here.\n\\v 2 Second verse text.\n' +
  '\\q1\n\\v 3 A quote line.\n';

const SLICE = slicePericope(usfmToUsj(USFM), 1, [1, 2, 3]);

describe('usjToDoc / docToUsj', () => {
  it('round-trips the slice: same verse texts and paragraph markers', () => {
    const { doc } = usjToDoc(SLICE);
    const back = docToUsj(doc, SLICE);

    expect(usjToVerses(back)).toEqual(usjToVerses(SLICE));
    const markersOf = (usj: typeof SLICE) =>
      usj.content.flatMap(n => (typeof n !== 'string' && n.type === 'para' ? [n.marker] : []));
    expect(markersOf(back)).toEqual(markersOf(SLICE));
  });

  it('keeps verse numbers and sids through the round-trip', () => {
    const { doc } = usjToDoc(SLICE);
    const back = docToUsj(doc, SLICE);
    const verses = back.content.flatMap(n =>
      typeof n !== 'string' && n.type === 'para'
        ? (n.content ?? []).filter(c => typeof c !== 'string' && c.type === 'verse')
        : []
    );

    expect(verses).toEqual([
      { type: 'verse', marker: 'v', number: '1', sid: 'GEN 1:1' },
      { type: 'verse', marker: 'v', number: '2', sid: 'GEN 1:2' },
      { type: 'verse', marker: 'v', number: '3', sid: 'GEN 1:3' },
    ]);
  });

  it('maps jsonPaths to doc positions addressing the right text', () => {
    const { doc, textPositions } = usjToDoc(SLICE);
    // Verse 2's text node in the slice: content[2] is the \p para, item 3.
    const pos = textPositions.get('$.content[2].content[3]');

    expect(pos).toBeDefined();
    expect(doc.textBetween(pos ?? 0, (pos ?? 0) + 'Second'.length)).toBe('Second');
  });
});

describe('annotationRanges', () => {
  const annotation = (jsonPath: string, start: number, end: number): RteAnnotation => ({
    id: 'a1',
    type: 'warning',
    message: 'm',
    selection: { start: { jsonPath, offset: start }, end: { jsonPath, offset: end } },
  });

  it('converts annotations into from/to ranges over the doc', () => {
    const { doc, textPositions } = usjToDoc(SLICE);
    const ranges = annotationRanges([annotation('$.content[2].content[3]', 7, 12)], textPositions);

    expect(ranges).toHaveLength(1);
    expect(doc.textBetween(ranges[0].from, ranges[0].to)).toBe('verse');
    expect(ranges[0].type).toBe('warning');
  });

  it('drops annotations whose jsonPath is not in the doc', () => {
    const { textPositions } = usjToDoc(SLICE);
    expect(annotationRanges([annotation('$.content[9].content[9]', 0, 3)], textPositions)).toEqual(
      []
    );
  });
});
