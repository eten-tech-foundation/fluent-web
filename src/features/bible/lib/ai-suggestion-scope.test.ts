import { describe, expect, it } from 'vitest';

import { pericopeSuggestionScope } from './ai-suggestion-scope';

const groups = [[1, 2], [10, 11], [3, 4], [5]].map((numbers, index) => ({
  pericopeNumber: String(index),
  pericopeTitle: index === 0 ? 'Creation' : null,
  verses: numbers.map(verseNumber => ({ verseNumber, chapterNumber: 1 })),
}));
const source = [1, 2, 3, 4, 5].map(verseNumber => ({
  id: verseNumber + 100,
  verseNumber,
  text: '',
}));

describe('pericope suggestion scope', () => {
  it('skips groups without source verses when choosing the next group', () => {
    expect(pericopeSuggestionScope(groups, 2, source)).toEqual({
      verseNumbers: [1, 2],
      nextVerseNumbers: [3, 4],
      pericopeNumbers: ['0', '2'],
      titleVerseNumbers: { '0': 1 },
    });
  });
  it('does not prefetch past the last renderable group', () => {
    expect(pericopeSuggestionScope(groups, 5, source)).toEqual({
      verseNumbers: [5],
      nextVerseNumbers: [],
      pericopeNumbers: ['3'],
      titleVerseNumbers: {},
    });
  });
  it('requests nothing for an unknown active verse', () => {
    expect(pericopeSuggestionScope(groups, 9, source)).toEqual({
      verseNumbers: [],
      nextVerseNumbers: [],
      pericopeNumbers: [],
      titleVerseNumbers: {},
    });
  });

  it('does not request optional titles for groups already saved in full', () => {
    const targets = [1, 2].map(verseNumber => ({ verseNumber, content: 'Saved scripture' }));
    expect(pericopeSuggestionScope(groups, 1, source, targets).titleVerseNumbers).toEqual({});
    expect(pericopeSuggestionScope(groups, 1, source, targets.slice(1)).titleVerseNumbers).toEqual({
      '0': 1,
    });
  });
});
