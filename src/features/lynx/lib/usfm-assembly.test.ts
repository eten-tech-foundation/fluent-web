import { describe, expect, it } from 'vitest';

import { buildUsfmFromVerses } from './usfm-assembly';

describe('buildUsfmFromVerses', () => {
  it('returns an empty string when there are no verses', () => {
    expect(buildUsfmFromVerses([])).toBe('');
  });

  it('assembles headers, chapters, and verses exactly like the server export', () => {
    const usfm = buildUsfmFromVerses([
      {
        bookCode: 'RUT',
        bookName: 'Ruth',
        chapterNumber: 1,
        verseNumber: 1,
        content: 'First verse.',
      },
      {
        bookCode: 'RUT',
        bookName: 'Ruth',
        chapterNumber: 1,
        verseNumber: 2,
        content: 'Second verse.',
      },
      { bookCode: 'RUT', bookName: 'Ruth', chapterNumber: 2, verseNumber: 1, content: null },
    ]);

    expect(usfm).toBe(
      '\\id RUT\n\\h Ruth\n\\mt Ruth\n' +
        '\\c 1\n\\p\n\\v 1 First verse.\n\\v 2 Second verse.\n' +
        '\\c 2\n\\p\n\\v 1 \n' +
        '\n'
    );
  });
});
