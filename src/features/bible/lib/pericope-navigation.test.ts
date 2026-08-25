import { describe, expect, it } from 'vitest';

import {
  hasSourceBackedVerse,
  nextRenderablePericopeVerse,
} from '@/features/bible/lib/pericope-navigation';
import type { PericopeGroup, Source } from '@/lib/types';

const group = (pericopeNumber: string, ...verseNumbers: number[]): PericopeGroup => ({
  pericopeNumber,
  pericopeTitle: `Section ${pericopeNumber}`,
  verses: verseNumbers.map(verseNumber => ({ chapterNumber: 1, verseNumber })),
});

// The chapter's source only goes up to verse 5, so a pericope over verses 6-7 renders nothing.
const SOURCE_VERSES: Source[] = [1, 2, 3, 4, 5].map(verseNumber => ({
  id: verseNumber,
  verseNumber,
  text: `Source ${verseNumber}`,
}));

describe('hasSourceBackedVerse', () => {
  it('is true when the source provides any of the pericope’s verses', () => {
    expect(hasSourceBackedVerse(group('1', 1, 2, 3), SOURCE_VERSES)).toBe(true);
  });

  it('is false when the source provides none of them', () => {
    expect(hasSourceBackedVerse(group('x', 6, 7), SOURCE_VERSES)).toBe(false);
  });

  it('is true when only part of the pericope is source-backed', () => {
    expect(hasSourceBackedVerse(group('2', 5, 6), SOURCE_VERSES)).toBe(true);
  });
});

describe('nextRenderablePericopeVerse', () => {
  it('lands on the first verse of the next pericope', () => {
    const pericopes = [group('1', 1, 2, 3), group('2', 4, 5)];

    expect(nextRenderablePericopeVerse(pericopes, 0, SOURCE_VERSES)).toBe(4);
  });

  it('skips a pericope the grid renders nothing for', () => {
    // The middle pericope has no source-backed verse, so no box renders for it: advancing into it
    // would leave the drafter looking at nothing, with no active box to advance out of.
    const pericopes = [group('1', 1, 2), group('gap', 6, 7), group('3', 3, 4)];

    expect(nextRenderablePericopeVerse(pericopes, 0, SOURCE_VERSES)).toBe(3);
  });

  it('returns null when nothing further renders', () => {
    const pericopes = [group('1', 1, 2), group('gap', 6, 7)];

    expect(nextRenderablePericopeVerse(pericopes, 0, SOURCE_VERSES)).toBeNull();
  });

  it('returns null on the last pericope', () => {
    const pericopes = [group('1', 1, 2, 3), group('2', 4, 5)];

    expect(nextRenderablePericopeVerse(pericopes, 1, SOURCE_VERSES)).toBeNull();
  });

  it('picks the first verse the grid actually lays out, not the first listed', () => {
    // The pericope lists verse 6 first, but only 4 and 5 render, and the box orders by source.
    const pericopes = [group('1', 1), group('2', 6, 5, 4)];

    expect(nextRenderablePericopeVerse(pericopes, 0, SOURCE_VERSES)).toBe(4);
  });
});
