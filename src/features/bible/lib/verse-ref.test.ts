import { describe, expect, it } from 'vitest';

import { formatVerseRef, parseVerseRef } from './verse-ref';

describe('verse references', () => {
  it('keeps current-chapter keys compatible and qualifies adjacent chapters', () => {
    expect(formatVerseRef({ chapterNumber: 3, verseNumber: 16 }, 3)).toBe('16');
    expect(formatVerseRef({ chapterNumber: 4, verseNumber: 1 }, 3)).toBe('4:1');
    expect(formatVerseRef({ chapterNumber: 3, verseNumber: 16 })).toBe('3:16');
  });

  it('parses current and adjacent chapter keys', () => {
    expect(parseVerseRef('16', 3)).toEqual({ chapterNumber: 3, verseNumber: 16 });
    expect(parseVerseRef('4:1', 3)).toEqual({ chapterNumber: 4, verseNumber: 1 });
  });

  it.each([
    '',
    '0',
    '3:0',
    '3:',
    ':16',
    '3:16:2',
    '3.5:16',
    ' 3:16',
    '3:16 ',
    '9007199254740992:1',
  ])('rejects invalid input %j', verseRef => expect(parseVerseRef(verseRef, 3)).toBeNull());

  it('round-trips both compact and qualified keys', () => {
    for (const ref of [
      { chapterNumber: 3, verseNumber: 16 },
      { chapterNumber: 4, verseNumber: 1 },
    ]) {
      const formatted = formatVerseRef(ref, 3);
      expect(parseVerseRef(formatted, 3)).toEqual(ref);
    }
  });
});
