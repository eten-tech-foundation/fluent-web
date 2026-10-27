import { describe, expect, it } from 'vitest';

import { pericopeVersesToUsj } from './pericope-usj';
import { verseAt } from './verse-numbers';

import type { Usj } from '@eten-tech-foundation/scripture-utilities';

// c 1 | s1 Title | p [1]First.[2]Second. | p (empty) | q1 [3]Third.
const usj: Usj = {
  type: 'USJ',
  version: '3.1',
  content: [
    { type: 'chapter', marker: 'c', number: '1' },
    { type: 'para', marker: 's1', content: ['Title'] },
    {
      type: 'para',
      marker: 'p',
      content: [
        { type: 'verse', marker: 'v', number: '1' },
        'First.',
        { type: 'verse', marker: 'v', number: '2' },
        'Second.',
      ],
    },
    { type: 'para', marker: 'p', content: [] },
    {
      type: 'para',
      marker: 'q1',
      content: [{ type: 'verse', marker: 'v', number: '3' }, 'Third.'],
    },
  ],
};

describe('verseAt', () => {
  it('finds the verse whose text holds the caret', () => {
    expect(verseAt(usj, 2, 3)).toBe(1);
    expect(verseAt(usj, 2, 10)).toBe(2);
    expect(verseAt(usj, 4, 3)).toBe(3);
  });

  it('keeps a caret right before a verse number with the verse before it', () => {
    expect(verseAt(usj, 2, 7)).toBe(1);
  });

  it('gives text before the first number after a heading to that number, as it is saved', () => {
    expect(verseAt(usj, 2, 0)).toBe(1);
  });

  it('carries a verse on into a line of its own with no number', () => {
    const continued = pericopeVersesToUsj(
      [
        {
          verseNumber: 1,
          text: 'Front Back.',
          markers: { paragraphs: [{ marker: 'q2', offset: 6 }] },
        },
        { verseNumber: 2, text: 'Second.', markers: null },
      ],
      1,
      'GEN'
    );
    const line = continued.content.findIndex(
      node => typeof node === 'object' && node.marker === 'q2'
    );
    expect(verseAt(continued, line, 1)).toBe(1);
  });

  it('has no verse in a heading or in an empty line under one', () => {
    expect(verseAt(usj, 1, 2)).toBeUndefined();
    const underHeading: Usj = {
      ...usj,
      content: [
        usj.content[0],
        usj.content[1],
        { type: 'para', marker: 'p', content: [] },
        usj.content[2],
      ],
    };
    expect(verseAt(underHeading, 2, 0)).toBeUndefined();
  });
});
