import { describe, expect, it } from 'vitest';

import { usfmToUsj } from './usfm-to-usj';
import { usjToVerses } from './usj-verses';

import type { Usj } from '@eten-tech-foundation/scripture-utilities';

describe('usjToVerses', () => {
  it('derives per-verse texts with chapter context', () => {
    const usj = usfmToUsj(
      '\\id GEN\n\\h Genesis\n\\mt Genesis\n' +
        '\\c 1\n\\p\n\\v 1 First words.\n\\v 2 Second words.\n' +
        '\\c 2\n\\p\n\\v 1 Other chapter.\n'
    );

    expect(usjToVerses(usj)).toEqual([
      { chapterNumber: 1, verseNumber: 1, text: 'First words.' },
      { chapterNumber: 1, verseNumber: 2, text: 'Second words.' },
      { chapterNumber: 2, verseNumber: 1, text: 'Other chapter.' },
    ]);
  });

  it('joins a verse that spans paragraphs with a single space', () => {
    const usj: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: '1', sid: 'GEN 1' },
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '1', sid: 'GEN 1:1' }, 'Starts here'],
        },
        { type: 'para', marker: 'p', content: ['and continues here.'] },
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '2', sid: 'GEN 1:2' }, 'Next verse.'],
        },
      ],
    };

    expect(usjToVerses(usj)).toEqual([
      { chapterNumber: 1, verseNumber: 1, text: 'Starts here and continues here.' },
      { chapterNumber: 1, verseNumber: 2, text: 'Next verse.' },
    ]);
  });
});
