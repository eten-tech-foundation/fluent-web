import { beforeEach, describe, expect, it } from 'vitest';

import { SAMPLE_URI, SAMPLE_USFM } from './sample-usfm';
import { snapshotStructure, verseRefAtRange } from './verse-map';
import { createLynxWorkspace } from './workspace';

import type { UsfmDocument } from '@sillsdev/lynx-usfm';

describe('verse-map', () => {
  let document: UsfmDocument;

  beforeEach(async () => {
    const ctx = await createLynxWorkspace();
    await ctx.openDocument(SAMPLE_URI, SAMPLE_USFM);
    document = (await ctx.documentManager.get(SAMPLE_URI))!;
  });

  it('snapshots book, chapters, and verses from the typed node tree', () => {
    const snapshot = snapshotStructure(document);

    expect(snapshot.bookCode).toBe('RUT');
    expect(snapshot.chapters.map(c => c.number)).toEqual(['1', '2']);
    // Document order, including the seeded out-of-order verse.
    expect(snapshot.chapters[0].verses.map(v => v.number)).toEqual(['1', '3', '2', '5']);
    expect(snapshot.chapters[1].verses.map(v => v.number)).toEqual(['1', '2', '4']);
  });

  it('reassembles verse text from text nodes, not regex', () => {
    const snapshot = snapshotStructure(document);
    const verse1 = snapshot.chapters[0].verses[0];

    expect(verse1.text).toContain('famine in the land');
    // The paragraph break inside chapter 1 must not leak other verses' text.
    expect(snapshot.chapters[0].verses[3].text).toContain('Go back home');
    expect(snapshot.chapters[0].verses[3].text).not.toContain('Bethlehem');
  });

  it('lists a pre-order node tree including paragraphs', () => {
    const snapshot = snapshotStructure(document);
    const types = new Set(snapshot.tree.map(n => n.type));

    expect(types).toContain('Book');
    expect(types).toContain('Chapter');
    expect(types).toContain('Paragraph');
    expect(types).toContain('Verse');
    expect(types).toContain('Text');
  });

  it('maps a diagnostic range to its enclosing verse reference', () => {
    // The unmatched curly quote lives in chapter 1 verse 5.
    const line = SAMPLE_USFM.split('\n').findIndex(l => l.includes('“'));
    const character = SAMPLE_USFM.split('\n')[line].indexOf('“');

    const ref = verseRefAtRange(document, {
      start: { line, character },
      end: { line, character: character + 1 },
    });

    expect(ref).toBe('RUT 1:5');
  });

  it('returns undefined for a range before any verse', () => {
    const ref = verseRefAtRange(document, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 3 },
    });

    expect(ref).toBeUndefined();
  });
});
