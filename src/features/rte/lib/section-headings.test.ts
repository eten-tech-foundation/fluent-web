import { describe, expect, it } from 'vitest';

import { changedVerses, pericopeVersesToUsj, usjToPericopeVerses } from './pericope-usj';

import type { Usj } from '@eten-tech-foundation/scripture-utilities';

const paragraph = (number: number, text: string) => ({
  type: 'para',
  marker: 'p',
  content: [{ type: 'verse', marker: 'v', number: String(number) }, text],
});
const usj = (content: Usj['content']): Usj => ({ type: 'USJ', version: '3.1', content });
const opening = { paragraphs: [{ marker: 'p', offset: 0 }] };

describe('standalone section headings (#432)', () => {
  it('anchors heading words before the following verse without changing either verse', () => {
    const document = usj([
      paragraph(1, 'First.'),
      { type: 'para', marker: 's1', content: ['The Creation'] },
      paragraph(2, 'Second.'),
    ]);
    expect(usjToPericopeVerses(document)).toEqual([
      { verseNumber: 1, text: 'First.', markers: opening },
      {
        verseNumber: 2,
        text: 'Second.',
        markers: { ...opening, headings: [{ marker: 's1', text: 'The Creation' }] },
      },
    ]);
  });

  it('loads ordered heading-only markers before an empty verse and opens body prose', () => {
    const headings = [
      { marker: 'ms1', text: 'Part One' },
      { marker: 's2', text: 'The Creation' },
    ];
    const document = pericopeVersesToUsj(
      [
        { verseNumber: 1, text: 'First.', markers: { paragraphs: [{ marker: 'q2', offset: 0 }] } },
        { verseNumber: 2, text: '', markers: { headings } },
      ],
      1
    );
    expect(document.content.slice(2)).toEqual([
      { type: 'para', marker: 'ms1', content: ['Part One'] },
      { type: 'para', marker: 's2', content: ['The Creation'] },
      { type: 'para', marker: 'p', content: [{ type: 'verse', marker: 'v', number: '2' }] },
    ]);
    expect(usjToPericopeVerses(document)[1]).toEqual({
      verseNumber: 2,
      text: '',
      markers: { ...opening, headings },
    });
  });

  it('round-trips headings with inline text and poetry splits', () => {
    const document = usj([
      {
        type: 'para',
        marker: 's1',
        content: ['The ', { type: 'char', marker: 'nd', content: ['LORD'] }],
      },
      { ...paragraph(1, 'First.'), marker: 'q1' },
      { type: 'para', marker: 'q2', content: ['Second line.'] },
      paragraph(2, 'Next.'),
    ]);
    const rows = usjToPericopeVerses(document);
    expect(rows[0]).toEqual({
      verseNumber: 1,
      text: 'First. Second line.',
      markers: {
        headings: [{ marker: 's1', text: 'The LORD' }],
        paragraphs: [
          { marker: 'q1', offset: 0 },
          { marker: 'q2', offset: 7 },
        ],
      },
    });
    expect(usjToPericopeVerses(pericopeVersesToUsj(rows, 1))).toEqual(rows);
  });

  it('repairs a verse nested in a heading without treating scripture as heading words', () => {
    const rows = usjToPericopeVerses(
      usj([
        paragraph(1, 'First.'),
        {
          type: 'para',
          marker: 's1',
          content: ['Title', { type: 'verse', marker: 'v', number: '2' }, 'Second.'],
        },
      ])
    );
    expect(rows[1]).toEqual({
      verseNumber: 2,
      text: 'Second.',
      markers: { ...opening, headings: [{ marker: 's1', text: 'Title' }] },
    });
    expect(pericopeVersesToUsj(rows, 1).content.slice(-2)).toEqual([
      { type: 'para', marker: 's1', content: ['Title'] },
      paragraph(2, 'Second.'),
    ]);
  });

  it('removes an emptied heading without storing an invalid empty title', () => {
    expect(
      usjToPericopeVerses(
        usj([
          paragraph(1, 'First.'),
          { type: 'para', marker: 's1', content: [' '] },
          paragraph(2, 'Second.'),
        ])
      )
    ).toEqual([
      { verseNumber: 1, text: 'First.', markers: opening },
      { verseNumber: 2, text: 'Second.', markers: opening },
    ]);
  });

  it.each([[{ marker: 's1', text: 'Edited' }], [{ marker: 's2', text: 'Original' }], undefined])(
    'reports heading text, level and removal changes',
    headings => {
      const before = [
        {
          verseNumber: 1,
          text: 'Verse.',
          markers: { ...opening, headings: [{ marker: 's1', text: 'Original' }] },
        },
      ];
      const after = [{ ...before[0], markers: { ...opening, ...(headings ? { headings } : {}) } }];
      expect(changedVerses(before, after)).toEqual(after);
    }
  );
});
