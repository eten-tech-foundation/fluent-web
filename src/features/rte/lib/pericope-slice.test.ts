import { describe, expect, it } from 'vitest';

import { mergePericope, slicePericope } from './pericope-slice';
import { usfmToUsj } from './usfm-to-usj';
import { usjToVerses } from './usj-verses';

import type { Usj } from '@eten-tech-foundation/scripture-utilities';

const CHAPTER = usfmToUsj(
  '\\id GEN\n\\h Genesis\n\\mt Genesis\n' +
    '\\c 1\n\\p\n\\v 1 Verse one.\n\\v 2 Verse two.\n\\v 3 Verse three.\n\\v 4 Verse four.\n\\v 5 Verse five.\n'
);

describe('slicePericope', () => {
  it('keeps book + chapter context and only the pericope verses', () => {
    const slice = slicePericope(CHAPTER, 1, [2, 3]);

    expect(slice.content[0]).toMatchObject({ type: 'book', code: 'GEN' });
    expect(slice.content[1]).toMatchObject({ type: 'chapter', number: '1' });
    expect(usjToVerses(slice)).toEqual([
      { chapterNumber: 1, verseNumber: 2, text: 'Verse two.' },
      { chapterNumber: 1, verseNumber: 3, text: 'Verse three.' },
    ]);
  });

  it('drops the h/mt headers from the editable slice', () => {
    const slice = slicePericope(CHAPTER, 1, [1]);
    const markers = (slice.content as Array<{ marker?: string }>).map(n => n.marker);

    expect(markers).not.toContain('h');
    expect(markers).not.toContain('mt');
  });
});

describe('mergePericope', () => {
  it('is verse-identity when the slice comes back unchanged', () => {
    const slice = slicePericope(CHAPTER, 1, [2, 3]);
    const merged = mergePericope(CHAPTER, slice, 1, [2, 3]);

    expect(usjToVerses(merged)).toEqual(usjToVerses(CHAPTER));
  });

  it('applies text edits and new paragraph structure from the edited slice', () => {
    const slice = slicePericope(CHAPTER, 1, [2, 3]);
    // Simulate the editor: verse 2 text changed, and verse 3 moved to its own paragraph.
    const edited: Usj = {
      ...slice,
      content: [
        slice.content[0],
        slice.content[1],
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '2', sid: 'GEN 1:2' },
            'Verse two, edited.',
          ],
        },
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '3', sid: 'GEN 1:3' }, 'Verse three.'],
        },
      ] as Usj['content'],
    };

    const merged = mergePericope(CHAPTER, edited, 1, [2, 3]);

    expect(usjToVerses(merged)).toEqual([
      { chapterNumber: 1, verseNumber: 1, text: 'Verse one.' },
      { chapterNumber: 1, verseNumber: 2, text: 'Verse two, edited.' },
      { chapterNumber: 1, verseNumber: 3, text: 'Verse three.' },
      { chapterNumber: 1, verseNumber: 4, text: 'Verse four.' },
      { chapterNumber: 1, verseNumber: 5, text: 'Verse five.' },
    ]);
    // The new paragraph break introduced in the editor must survive the merge.
    const paraCount = (merged.content as Array<{ type: string }>).filter(
      n => n.type === 'para'
    ).length;
    expect(paraCount).toBeGreaterThan(
      (CHAPTER.content as Array<{ type: string }>).filter(n => n.type === 'para').length - 2
    );
  });
});
