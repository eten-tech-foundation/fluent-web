import { describe, expect, it } from 'vitest';

import type { PericopeVerseText } from '@/features/rte/lib/pericope-usj';
import { scopeBlockFormatToVerse } from '@/features/rte/lib/scoped-block-format';

const verse = (
  verseNumber: number,
  text: string,
  paragraphs?: Array<{ marker: string; offset: number }>
): PericopeVerseText => ({
  verseNumber,
  text,
  markers: paragraphs ? { paragraphs } : null,
});

/** A fresh chapter: one paragraph holding every verse — the shape #427's bug 3 is about. */
const unsplit = [verse(1, 'First.'), verse(2, 'Second.'), verse(3, 'Third.')];

describe('scopeBlockFormatToVerse', () => {
  it('scopes the format to the active verse and reopens the surrounding block after it', () => {
    const result = scopeBlockFormatToVerse(unsplit, 2, 'q1');
    expect(result).not.toBeNull();
    const { updated, changed } = result!;

    expect(updated[1].markers?.paragraphs).toEqual([{ marker: 'q1', offset: 0 }]);
    expect(updated[2].markers?.paragraphs).toEqual([{ marker: 'p', offset: 0 }]);
    expect(updated[0]).toBe(unsplit[0]);
    expect(changed.map(v => v.verseNumber)).toEqual([2, 3]);
  });

  it('reopens with the surrounding block marker, not always p', () => {
    const inPoetry = [
      verse(1, 'First.', [{ marker: 'q1', offset: 0 }]),
      verse(2, 'Second.'),
      verse(3, 'Third.'),
    ];
    const { updated } = scopeBlockFormatToVerse(inPoetry, 2, 's1')!;
    expect(updated[1].markers?.paragraphs).toEqual([{ marker: 's1', offset: 0 }]);
    expect(updated[2].markers?.paragraphs).toEqual([{ marker: 'q1', offset: 0 }]);
  });

  it('handles the first verse of the chapter', () => {
    const { updated, changed } = scopeBlockFormatToVerse(unsplit, 1, 'q1')!;
    expect(updated[0].markers?.paragraphs).toEqual([{ marker: 'q1', offset: 0 }]);
    expect(updated[1].markers?.paragraphs).toEqual([{ marker: 'p', offset: 0 }]);
    expect(changed.map(v => v.verseNumber)).toEqual([1, 2]);
  });

  it('handles the last verse without inventing a follower', () => {
    const { updated, changed } = scopeBlockFormatToVerse(unsplit, 3, 'q1')!;
    expect(updated[2].markers?.paragraphs).toEqual([{ marker: 'q1', offset: 0 }]);
    expect(changed.map(v => v.verseNumber)).toEqual([3]);
  });

  it('leaves a follower alone when it already opens its own block', () => {
    const rows = [
      verse(1, 'First.'),
      verse(2, 'Second.'),
      verse(3, 'Third.', [{ marker: 'q2', offset: 0 }]),
    ];
    const { updated, changed } = scopeBlockFormatToVerse(rows, 2, 'q1')!;
    expect(updated[2]).toBe(rows[2]);
    expect(changed.map(v => v.verseNumber)).toEqual([2]);
  });

  it('keeps mid-verse splits on the active verse', () => {
    const rows = [verse(1, 'First.'), verse(2, 'Second half here.', [{ marker: 'q2', offset: 7 }])];
    const { updated } = scopeBlockFormatToVerse(rows, 2, 'q1')!;
    expect(updated[1].markers?.paragraphs).toEqual([
      { marker: 'q1', offset: 0 },
      { marker: 'q2', offset: 7 },
    ]);
  });

  it('replaces the marker in place when the active verse already opens its own multi-verse block', () => {
    const rows = [
      verse(1, 'First.'),
      verse(2, 'Second.', [{ marker: 'm', offset: 0 }]),
      verse(3, 'Third.'),
    ];
    const { updated, changed } = scopeBlockFormatToVerse(rows, 2, 'q1')!;
    expect(updated[1].markers?.paragraphs).toEqual([{ marker: 'q1', offset: 0 }]);
    expect(updated[2].markers?.paragraphs).toEqual([{ marker: 'm', offset: 0 }]);
    expect(changed.map(v => v.verseNumber)).toEqual([2, 3]);
  });

  it('returns null when the active verse is already a single-verse block (formatPara handles it)', () => {
    const rows = [
      verse(1, 'First.'),
      verse(2, 'Second.', [{ marker: 'q1', offset: 0 }]),
      verse(3, 'Third.', [{ marker: 'p', offset: 0 }]),
    ];
    expect(scopeBlockFormatToVerse(rows, 2, 's1')).toBeNull();
  });

  it('returns null for an unknown verse', () => {
    expect(scopeBlockFormatToVerse(unsplit, 99, 'q1')).toBeNull();
  });
});
