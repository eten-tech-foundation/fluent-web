import { describe, expect, it } from 'vitest';

import {
  changedVerses,
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from './pericope-usj';

import type { Usj } from '@eten-tech-foundation/scripture-utilities';

const VERSES: PericopeVerseText[] = [
  { verseNumber: 1, text: 'In the beginning God created the heavens and the earth.' },
  { verseNumber: 2, text: 'The earth was formless and empty.' },
];

describe('pericopeVersesToUsj', () => {
  it('puts every verse in one paragraph, each behind its verse marker', () => {
    const usj = pericopeVersesToUsj(VERSES, 1, 'GEN');

    expect(usj.content).toEqual([
      { type: 'chapter', marker: 'c', number: '1' },
      {
        type: 'para',
        marker: 'p',
        content: [
          { type: 'verse', marker: 'v', number: '1', sid: 'GEN 1:1' },
          VERSES[0].text,
          { type: 'verse', marker: 'v', number: '2', sid: 'GEN 1:2' },
          VERSES[1].text,
        ],
      },
    ]);
  });

  it('keeps the marker of an untranslated verse so it can be clicked into', () => {
    const usj = pericopeVersesToUsj([{ verseNumber: 3, text: '' }], 1);
    const para = usj.content[1] as { content: unknown[] };

    expect(para.content).toEqual([{ type: 'verse', marker: 'v', number: '3' }]);
  });
});

describe('usjToPericopeVerses', () => {
  it('round-trips the verses it was built from', () => {
    expect(usjToPericopeVerses(pericopeVersesToUsj(VERSES, 1, 'GEN'))).toEqual(VERSES);
  });

  it('rejoins a verse the translator split across paragraphs', () => {
    // What the editor produces after pressing Enter mid-verse: the paragraph break is real in the
    // editor, but the verse row can only hold one string (fluent-api#263).
    const split: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: '1' },
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '1' }, 'Starts here'],
        },
        { type: 'para', marker: 'p', content: ['and continues here.'] },
      ],
    } as Usj;

    expect(usjToPericopeVerses(split)).toEqual([
      { verseNumber: 1, text: 'Starts here and continues here.' },
    ]);
  });

  it('drops the structural space USJ carries before the next verse marker', () => {
    const withStructuralSpace: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1' },
            'First verse. ',
            { type: 'verse', marker: 'v', number: '2' },
            'Second verse.',
          ],
        },
      ],
    } as Usj;

    expect(usjToPericopeVerses(withStructuralSpace)).toEqual([
      { verseNumber: 1, text: 'First verse.' },
      { verseNumber: 2, text: 'Second verse.' },
    ]);
  });

  it('includes text inside character markers', () => {
    const withCharMarker: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1' },
            'the ',
            { type: 'char', marker: 'nd', content: ['LORD'] },
            ' said',
          ],
        },
      ],
    } as Usj;

    expect(usjToPericopeVerses(withCharMarker)).toEqual([
      { verseNumber: 1, text: 'the LORD said' },
    ]);
  });
});

describe('changedVerses', () => {
  it('reports only the verses whose text moved', () => {
    const next = [VERSES[0], { verseNumber: 2, text: 'The earth was formless, and empty.' }];

    expect(changedVerses(VERSES, next)).toEqual([
      { verseNumber: 2, text: 'The earth was formless, and empty.' },
    ]);
  });

  it('reports a verse emptied by the translator, rather than dropping it', () => {
    // The verse disappears from the derived list once it has no text, but "cleared" is an edit
    // that has to reach the server or the old text silently survives.
    expect(changedVerses(VERSES, [VERSES[0]])).toEqual([{ verseNumber: 2, text: '' }]);
  });

  it('is empty when nothing changed', () => {
    expect(changedVerses(VERSES, [...VERSES])).toEqual([]);
  });
});
