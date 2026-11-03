import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PericopeContextText } from '@/features/bible/components/PericopeContextText';
import type { PericopeContextChapter } from '@/features/bible/hooks/usePericopeContext';
import type { PericopeGroup, Source, TargetVerse } from '@/lib/types';
import { BIBLE_UNAVAILABLE_MESSAGE } from '@/test/drafting-i18n';

const group: PericopeGroup = {
  pericopeNumber: '2',
  pericopeTitle: null,
  verses: [
    { chapterNumber: 2, verseNumber: 25 },
    { chapterNumber: 3, verseNumber: 1 },
  ],
};

const chapters = new Map<number, PericopeContextChapter>([
  [
    2,
    {
      sourceVerses: [{ id: 1, verseNumber: 25, text: 'Source text.' } as Source],
      targetVerses: [{ verseNumber: 25, content: 'Drafted context.' } as TargetVerse],
      isLoading: false,
      isError: false,
      sourceIsLoading: false,
      sourceIsError: false,
    },
  ],
]);

describe('PericopeContextText', () => {
  it('draws the adjacent draft in the scripture font and its verse label in the app font', () => {
    render(
      <PericopeContextText chapters={chapters} currentChapter={3} group={group} side='before' />
    );

    expect(screen.getByText('Drafted context.').closest('.target-scripture')).not.toBeNull();
    expect(screen.getByText('25')).toHaveClass('font-sans');
  });

  // #608 review: the drafts come from the app's own API, not a Bible.
  it('leaves a neighboring verse blank when only its draft request failed', () => {
    const failedDraft = new Map<number, PericopeContextChapter>([
      [2, { ...chapters.get(2)!, targetVerses: [], isError: true }],
    ]);
    render(
      <PericopeContextText chapters={failedDraft} currentChapter={3} group={group} side='before' />
    );

    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.queryByText(BIBLE_UNAVAILABLE_MESSAGE)).not.toBeInTheDocument();
  });

  it('says the Bible is unavailable when the source request failed', () => {
    const failedSource = new Map<number, PericopeContextChapter>([
      [
        2,
        {
          ...chapters.get(2)!,
          sourceVerses: [],
          targetVerses: [],
          isError: true,
          sourceIsError: true,
        },
      ],
    ]);
    render(
      <PericopeContextText chapters={failedSource} currentChapter={3} group={group} side='before' />
    );

    expect(screen.getByText(BIBLE_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  });
});
