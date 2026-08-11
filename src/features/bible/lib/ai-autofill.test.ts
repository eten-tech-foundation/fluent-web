import { describe, expect, it } from 'vitest';

import { pendingAiAutoFills } from '@/features/bible/lib/ai-autofill';
import type { TargetVerse } from '@/lib/types';

const emptyPericope: TargetVerse[] = [
  { verseNumber: 1, content: '' },
  { verseNumber: 2, content: '' },
  { verseNumber: 3, content: '' },
  { verseNumber: 4, content: '' },
];

const PERICOPE = [1, 2, 3, 4];

describe('pendingAiAutoFills', () => {
  it('fills only the verse in focus for the textarea path', () => {
    const fills = pendingAiAutoFills({
      candidateVerseNumbers: [2],
      verses: emptyPericope,
      suggestions: { 1: 'One.', 2: 'Two.', 3: 'Three.' },
      touchedVerseNumbers: new Set(),
    });

    expect(fills).toEqual([{ verseNumber: 2, text: 'Two.' }]);
  });

  it('fills every verse of the pericope that already has a suggestion', () => {
    // Generation runs three verses ahead, so the pericope opens with its first three populated.
    const fills = pendingAiAutoFills({
      candidateVerseNumbers: PERICOPE,
      verses: emptyPericope,
      suggestions: { 1: 'One.', 2: 'Two.', 3: 'Three.' },
      touchedVerseNumbers: new Set(),
    });

    expect(fills).toEqual([
      { verseNumber: 1, text: 'One.' },
      { verseNumber: 2, text: 'Two.' },
      { verseNumber: 3, text: 'Three.' },
    ]);
  });

  it('populates progressively: the next verse lands on its own once it is ready', () => {
    // Same pericope one beat later. The first three arrived and were written, so only verse 4 —
    // the one that just became available — is left to deliver.
    const fills = pendingAiAutoFills({
      candidateVerseNumbers: PERICOPE,
      verses: [
        { verseNumber: 1, content: 'One.' },
        { verseNumber: 2, content: 'Two.' },
        { verseNumber: 3, content: 'Three.' },
        { verseNumber: 4, content: '' },
      ],
      suggestions: { 1: 'One.', 2: 'Two.', 3: 'Three.', 4: 'Four.' },
      touchedVerseNumbers: new Set([1, 2, 3]),
    });

    expect(fills).toEqual([{ verseNumber: 4, text: 'Four.' }]);
  });

  it('never overwrites a verse the translator wrote in', () => {
    const fills = pendingAiAutoFills({
      candidateVerseNumbers: PERICOPE,
      verses: [
        { verseNumber: 1, content: 'Drafted by hand.' },
        { verseNumber: 2, content: '   ' },
        { verseNumber: 3, content: '' },
        { verseNumber: 4, content: '' },
      ],
      suggestions: { 1: 'One.', 2: 'Two.', 3: 'Three.' },
      // Verse 2 was typed into and then cleared: whitespace is empty, but it is the translator's.
      touchedVerseNumbers: new Set([1, 2]),
    });

    expect(fills).toEqual([{ verseNumber: 3, text: 'Three.' }]);
  });

  it('waits for a verse whose suggestion has not arrived', () => {
    const fills = pendingAiAutoFills({
      candidateVerseNumbers: PERICOPE,
      verses: emptyPericope,
      suggestions: { 1: 'One.', 3: 'Three.' },
      touchedVerseNumbers: new Set(),
    });

    // Verse 2 is skipped rather than blocking verse 3 behind it.
    expect(fills).toEqual([
      { verseNumber: 1, text: 'One.' },
      { verseNumber: 3, text: 'Three.' },
    ]);
  });
});
