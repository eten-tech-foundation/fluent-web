import { describe, expect, it } from 'vitest';

import {
  changedVerses,
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from './pericope-usj';

import type { Usj } from '@eten-tech-foundation/scripture-utilities';

const VERSES: PericopeVerseText[] = [
  {
    verseNumber: 1,
    text: 'In the beginning God created the heavens and the earth.',
    markers: null,
  },
  { verseNumber: 2, text: 'The earth was formless and empty.', markers: null },
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
    const usj = pericopeVersesToUsj([{ verseNumber: 3, text: '', markers: null }], 1);
    const para = usj.content[1] as { content: unknown[] };

    expect(para.content).toEqual([{ type: 'verse', marker: 'v', number: '3' }]);
  });
});

describe('usjToPericopeVerses', () => {
  it('round-trips the verses it was built from, upgrading the first to explicit markers', () => {
    // A null-markers (legacy) first verse renders as opening the default paragraph, so deriving
    // it back records that fact explicitly: {p, 0}. The export output is identical either way;
    // legacy rows simply become explicit on their first save.
    expect(usjToPericopeVerses(pericopeVersesToUsj(VERSES, 1, 'GEN'))).toEqual([
      { ...VERSES[0], markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
      VERSES[1],
    ]);
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
      {
        verseNumber: 1,
        text: 'Starts here and continues here.',
        markers: {
          paragraphs: [
            { marker: 'p', offset: 0 },
            { marker: 'p', offset: 12 },
          ],
        },
      },
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
      {
        verseNumber: 1,
        text: 'First verse.',
        markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
      },
      { verseNumber: 2, text: 'Second verse.', markers: null },
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
      {
        verseNumber: 1,
        text: 'the LORD said',
        markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
      },
    ]);
  });

  it('keeps every part of a character marker, split across items and nested', () => {
    // \wj Holy \nd God\nd*, hear us\wj* — one marker, three content items, one of them a marker.
    const nested: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1' },
            {
              type: 'char',
              marker: 'wj',
              content: ['Holy ', { type: 'char', marker: 'nd', content: ['God'] }, ', hear us'],
            },
            ' he said.',
          ],
        },
      ],
    } as Usj;

    expect(usjToPericopeVerses(nested)).toEqual([
      {
        verseNumber: 1,
        text: 'Holy God, hear us he said.',
        markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
      },
    ]);
  });

  it('leaves a footnote out of the verse row', () => {
    // The note's text belongs to the note, not to the sentence it hangs off.
    const withNote: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1' },
            'In the beginning',
            {
              type: 'note',
              marker: 'f',
              caller: '+',
              content: [{ type: 'char', marker: 'ft', content: ['Or "When God began"'] }],
            },
            ' God created.',
          ],
        },
      ],
    } as Usj;

    expect(usjToPericopeVerses(withNote)).toEqual([
      {
        verseNumber: 1,
        text: 'In the beginning God created.',
        markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
      },
    ]);
  });
});

describe('paragraph markers', () => {
  it('captures the marker of a verse that opens its paragraph', () => {
    const usj: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: '1' },
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '1' }, 'In the beginning'],
        },
      ],
    } as Usj;

    expect(usjToPericopeVerses(usj)[0].markers).toEqual({
      paragraphs: [{ marker: 'p', offset: 0 }],
    });
  });

  it('gives a verse that continues the paragraph null markers', () => {
    const usj: Usj = {
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

    expect(usjToPericopeVerses(usj)[1].markers).toBeNull();
  });

  it('derives a mid-verse split at its offset in the joined text', () => {
    const usj: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '1' }, 'Starts here'],
        },
        { type: 'para', marker: 'q2', content: ['and continues here.'] },
      ],
    } as Usj;

    expect(usjToPericopeVerses(usj)[0]).toEqual({
      verseNumber: 1,
      text: 'Starts here and continues here.',
      markers: {
        paragraphs: [
          { marker: 'p', offset: 0 },
          { marker: 'q2', offset: 12 },
        ],
      },
    });
  });

  it('keeps the offset-zero marker of an empty verse that opens a paragraph', () => {
    const usj: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'para', marker: 'p', content: [{ type: 'verse', marker: 'v', number: '1' }] },
      ],
    } as Usj;

    expect(usjToPericopeVerses(usj)[0]).toEqual({
      verseNumber: 1,
      text: '',
      markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
    });
  });

  it('anchors the offset-zero marker to the paragraph the verse text is really in', () => {
    // Enter pressed right after the verse marker and before typing: the paragraph the marker sits
    // in ends up empty, and the words land in the one below it. Reading the marker off the empty
    // paragraph would store `p` and render the verse unstyled on reload.
    const usj: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'para', marker: 'p', content: [{ type: 'verse', marker: 'v', number: '1' }] },
        { type: 'para', marker: 'q1', content: ['Sung, not spoken.'] },
      ],
    } as Usj;

    expect(usjToPericopeVerses(usj)[0]).toEqual({
      verseNumber: 1,
      text: 'Sung, not spoken.',
      markers: { paragraphs: [{ marker: 'q1', offset: 0 }] },
    });
  });

  it('keeps the paragraph of a verse whose marker ends the paragraph above', () => {
    const usj: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1' },
            'First verse.',
            { type: 'verse', marker: 'v', number: '2' },
          ],
        },
        { type: 'para', marker: 'q1', content: ['Second verse.'] },
      ],
    } as Usj;

    expect(usjToPericopeVerses(usj)[1]).toEqual({
      verseNumber: 2,
      text: 'Second verse.',
      markers: { paragraphs: [{ marker: 'q1', offset: 0 }] },
    });
  });

  it('keeps the opening marker of a verse the drafter typed in front of', () => {
    // The editor puts the verse number in a node the caret can sit before, so text can land ahead
    // of the first verse marker. It has no earlier verse to belong to and joins the one that
    // follows, which therefore still starts the paragraph.
    const usj: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'para',
          marker: 'q1',
          content: ['Typed in front. ', { type: 'verse', marker: 'v', number: '1' }, 'The verse.'],
        },
      ],
    } as Usj;

    expect(usjToPericopeVerses(usj)[0]).toEqual({
      verseNumber: 1,
      text: 'Typed in front. The verse.',
      markers: { paragraphs: [{ marker: 'q1', offset: 0 }] },
    });
  });

  it('anchors offsets to visible text, unmoved by a footnote', () => {
    const usj: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1' },
            'In the beginning',
            {
              type: 'note',
              marker: 'f',
              caller: '+',
              content: [{ type: 'char', marker: 'ft', content: ['Or "When God began"'] }],
            },
            ' God created.',
          ],
        },
        { type: 'para', marker: 'q1', content: ['Second part.'] },
      ],
    } as Usj;

    expect(usjToPericopeVerses(usj)[0].markers).toEqual({
      paragraphs: [
        { marker: 'p', offset: 0 },
        { marker: 'q1', offset: 30 },
      ],
    });
  });

  it('rebuilds stored paragraph structure when loading verses into the editor', () => {
    const verses: PericopeVerseText[] = [
      {
        verseNumber: 1,
        text: 'Starts here and continues here.',
        markers: {
          paragraphs: [
            { marker: 'p', offset: 0 },
            { marker: 'q2', offset: 12 },
          ],
        },
      },
    ];

    expect(pericopeVersesToUsj(verses, 1).content).toEqual([
      { type: 'chapter', marker: 'c', number: '1' },
      {
        type: 'para',
        marker: 'p',
        content: [{ type: 'verse', marker: 'v', number: '1' }, 'Starts here '],
      },
      { type: 'para', marker: 'q2', content: ['and continues here.'] },
    ]);
  });

  it('round-trips text and markers through the editor shape unchanged', () => {
    const verses: PericopeVerseText[] = [
      {
        verseNumber: 1,
        text: 'Starts here and continues here.',
        markers: {
          paragraphs: [
            { marker: 'p', offset: 0 },
            { marker: 'q2', offset: 12 },
          ],
        },
      },
      { verseNumber: 2, text: 'Continues the q2 paragraph.', markers: null },
    ];

    expect(usjToPericopeVerses(pericopeVersesToUsj(verses, 1, 'GEN'))).toEqual(verses);
  });
});

describe('changedVerses', () => {
  it('reports a markers-only change so a new paragraph reaches the server', () => {
    const previous: PericopeVerseText[] = [{ verseNumber: 1, text: 'abc', markers: null }];
    const next: PericopeVerseText[] = [
      { verseNumber: 1, text: 'abc', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
    ];

    expect(changedVerses(previous, next)).toEqual(next);
  });

  it('is empty when text and markers both match', () => {
    const verses: PericopeVerseText[] = [
      { verseNumber: 1, text: 'abc', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
    ];
    const same: PericopeVerseText[] = [
      { verseNumber: 1, text: 'abc', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
    ];

    expect(changedVerses(verses, same)).toEqual([]);
  });
});

describe('changedVerses (text)', () => {
  it('reports only the verses whose text moved', () => {
    const next = [
      VERSES[0],
      { verseNumber: 2, text: 'The earth was formless, and empty.', markers: null },
    ];

    expect(changedVerses(VERSES, next)).toEqual([
      { verseNumber: 2, text: 'The earth was formless, and empty.', markers: null },
    ]);
  });

  it('reports a verse emptied by the translator, rather than dropping it', () => {
    // The verse disappears from the derived list once it has no text, but "cleared" is an edit
    // that has to reach the server or the old text silently survives.
    expect(changedVerses(VERSES, [VERSES[0]])).toEqual([
      { verseNumber: 2, text: '', markers: null },
    ]);
  });

  it('is empty when nothing changed', () => {
    expect(changedVerses(VERSES, [...VERSES])).toEqual([]);
  });
});
