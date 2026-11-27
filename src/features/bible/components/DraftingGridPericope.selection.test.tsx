import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DraftingGridPericope } from '@/features/bible/components/DraftingGridPericope';
import { DraftingTargetColumn } from '@/features/bible/components/DraftingGridVerse';
import type { PericopeGroup, ProjectItem, Source, TargetVerse } from '@/lib/types';
import { initDraftingTestI18n } from '@/test/drafting-i18n';

const sourceVerses: Source[] = [1, 2, 3, 4].map(verseNumber => ({
  id: verseNumber,
  verseNumber,
  text: `Source 1:${verseNumber}`,
}));
const verses: TargetVerse[] = sourceVerses.map(({ verseNumber }) => ({
  verseNumber,
  content: `Draft 1:${verseNumber}`,
}));
const pericopes: PericopeGroup[] = [
  {
    pericopeNumber: '1',
    pericopeTitle: null,
    verses: [
      { chapterNumber: 1, verseNumber: 1 },
      { chapterNumber: 1, verseNumber: 2 },
    ],
  },
  {
    pericopeNumber: '2',
    pericopeTitle: null,
    verses: [
      { chapterNumber: 1, verseNumber: 3 },
      { chapterNumber: 1, verseNumber: 4 },
    ],
  },
];

const grid = (activeVerseId: number, readOnly = false) => (
  <DraftingGridPericope
    activeVerseId={activeVerseId}
    aiSuggestions={{}}
    bibleVerseMap={new Map()}
    globalNextUntouchedVerse={null}
    handleActiveVerseChange={vi.fn()}
    handleKeyDown={vi.fn()}
    handleNextClick={vi.fn(async () => {})}
    handleNextPericopeClick={vi.fn(async () => {})}
    handleTextChange={vi.fn()}
    isAiActive={false}
    isAiThresholdMet={false}
    isTranslationComplete={false}
    pericopes={pericopes}
    projectItem={{ bookCode: 'GEN', chapterNumber: 1, chapterAssignmentId: 1 } as ProjectItem}
    readOnly={readOnly}
    selectedPanel={1}
    sourceVerses={sourceVerses}
    suggestionStatus='idle'
    textareaRefs={{ current: {} }}
    verseRefs={{ current: {} }}
    verses={verses}
  />
);

/** The target box of the pericope that holds verse `n` (a field, or text when read-only). */
const targetBox = (n: number) =>
  (
    screen.queryByLabelText(`Translation for verse ${n}`) ?? screen.getByText(`Draft 1:${n}`)
  ).closest<HTMLElement>('[class*="rounded-[12px]"]')!;

/** The background utilities on an element, for both themes. */
const backgrounds = (element: Element) =>
  [...element.classList].filter(name => /^(dark:)?bg-/.test(name));

describe('the selected pericope in Pericope View', () => {
  beforeAll(initDraftingTestI18n);

  it('shows the background of the selected verse in Verse View (#648)', () => {
    const { unmount } = render(
      <DraftingTargetColumn
        activeVerseId={3}
        aiSuggestions={{}}
        effectiveRevealedVerses={new Set([1, 2, 3, 4])}
        handleActiveVerseChange={vi.fn()}
        handleKeyDown={vi.fn()}
        handleTextChange={vi.fn()}
        isAiActive={false}
        isAiThresholdMet={false}
        readOnly={false}
        suggestionStatus='idle'
        textareaRefs={{ current: {} }}
        verseNumber={3}
        verses={verses}
      />
    );
    const selectedVerse = screen.getByLabelText('Translation for verse 3').parentElement!;
    expect(selectedVerse).toHaveClass('border-primary');
    const verseViewBackground = backgrounds(selectedVerse);
    unmount();

    render(grid(3));

    expect(targetBox(3)).toHaveClass('border-primary');
    expect(backgrounds(targetBox(3))).toEqual(verseViewBackground);
  });

  it('keeps the card colour on the pericope that is not selected', () => {
    render(grid(3));

    expect(targetBox(1)).not.toHaveClass('border-primary');
    expect(backgrounds(targetBox(1))).toEqual(
      expect.arrayContaining(['bg-[#f0f4f9]', 'dark:bg-card'])
    );
  });

  it('moves the background with the selection', () => {
    const { rerender } = render(grid(3));
    expect(backgrounds(targetBox(3))).toEqual([]);

    rerender(grid(1));

    expect(backgrounds(targetBox(1))).toEqual([]);
    expect(targetBox(1)).toHaveClass('border-primary');
    expect(backgrounds(targetBox(3))).toEqual(
      expect.arrayContaining(['bg-[#f0f4f9]', 'dark:bg-card'])
    );
  });

  it('shows the background together with the border when the chapter is read-only', () => {
    render(grid(3, true));

    expect(targetBox(3)).toHaveClass('border-primary');
    expect(backgrounds(targetBox(3))).toEqual([]);
    expect(backgrounds(targetBox(1))).toEqual(
      expect.arrayContaining(['bg-[#f0f4f9]', 'dark:bg-card'])
    );
  });
});
