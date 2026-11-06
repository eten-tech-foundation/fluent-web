import { describe, expect, it } from 'vitest';

import {
  canonicalPassageBriefingSelection,
  nextPassageBriefingContext,
} from './assistant.navigation';

const context = { projectId: 1, bookCode: 'MRK', chapter: 8, activeVerse: 31 };
const groups = [
  { pericopeNumber: '1', pericopeTitle: null, verses: [{ chapterNumber: 8, verseNumber: 31 }] },
  {
    pericopeNumber: '2',
    pericopeTitle: null,
    verses: [
      { chapterNumber: 8, verseNumber: 32 },
      { chapterNumber: 9, verseNumber: 1 },
    ],
  },
  { pericopeNumber: '3', pericopeTitle: null, verses: [{ chapterNumber: 9, verseNumber: 2 }] },
];

describe('nextPassageBriefingContext', () => {
  it('returns exactly the first selector of the current pericope successor', () => {
    expect(nextPassageBriefingContext(context, groups)).toEqual({
      projectId: 1,
      bookCode: 'MRK',
      chapter: 8,
      activeVerse: 32,
    });
  });

  it('does not invent a successor for an unknown or terminal passage', () => {
    expect(nextPassageBriefingContext({ ...context, activeVerse: 99 }, groups)).toBeNull();
    expect(
      nextPassageBriefingContext({ ...context, chapter: 9, activeVerse: 2 }, groups)
    ).toBeNull();
  });
});

describe('canonicalPassageBriefingSelection', () => {
  const sameChapterContext = { projectId: 1, bookCode: 'JHN', chapter: 3, activeVerse: 1 };
  const sameChapterGroups = [
    {
      pericopeNumber: '1',
      pericopeTitle: null,
      verses: [
        { chapterNumber: 3, verseNumber: 1 },
        { chapterNumber: 3, verseNumber: 2 },
      ],
    },
  ];

  it('gives every active verse in one pericope the same canonical request identity', () => {
    const first = canonicalPassageBriefingSelection(sameChapterContext, sameChapterGroups);
    const second = canonicalPassageBriefingSelection(
      { ...sameChapterContext, activeVerse: 2 },
      sameChapterGroups
    );
    expect(first).toEqual({ context: sameChapterContext, reference: 'JHN 3:1-2' });
    expect(second).toEqual(first);
  });

  it('uses the first ordered cross-chapter reference and formats the complete range', () => {
    const crossing = [
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        verses: [
          { chapterNumber: 4, verseNumber: 1 },
          { chapterNumber: 3, verseNumber: 36 },
        ],
      },
    ];
    expect(
      canonicalPassageBriefingSelection(
        { ...sameChapterContext, chapter: 4, activeVerse: 1 },
        crossing
      )
    ).toEqual({
      context: { ...sameChapterContext, chapter: 3, activeVerse: 36 },
      reference: 'JHN 3:36–4:1',
    });
  });

  it('falls back to the exact active verse only when no pericope covers it', () => {
    const exact = { ...sameChapterContext, activeVerse: 9 };
    expect(canonicalPassageBriefingSelection(exact, sameChapterGroups)).toEqual({
      context: exact,
      reference: 'JHN 3:9',
    });
  });
});
