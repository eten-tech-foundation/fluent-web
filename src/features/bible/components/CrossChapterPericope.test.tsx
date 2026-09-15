import { type ComponentProps } from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DraftingGridPericope } from '@/features/bible/components/DraftingGridPericope';
import { PericopeContextText } from '@/features/bible/components/PericopeContextText';
import { config } from '@/lib/config';
import type { PericopeGroup, ProjectItem, Source } from '@/lib/types';

const fullGroup: PericopeGroup = {
  pericopeNumber: '29_2',
  pericopeTitle: null,
  verses: [
    ...Array.from({ length: 8 }, (_, i) => ({ chapterNumber: 8, verseNumber: 31 + i })),
    { chapterNumber: 9, verseNumber: 1 },
  ],
};
const chapter8: Source[] = [1, 31, 32, 33, 34, 35, 36, 37, 38].map(verseNumber => ({
  id: 800 + verseNumber,
  verseNumber,
  text: `Source Mark 8:${verseNumber}`,
}));
const chapter9: Source[] = [{ id: 901, verseNumber: 1, text: 'Source Mark 9:1' }];
const contextChapters = new Map([
  [
    8,
    {
      isLoading: false,
      isError: false,
      sourceVerses: chapter8,
      targetVerses: [{ verseNumber: 31, content: 'Saved Mark 8:31' }],
    },
  ],
  [
    9,
    {
      isLoading: false,
      isError: false,
      sourceVerses: chapter9,
      targetVerses: [{ verseNumber: 1, content: 'Saved Mark 9:1' }],
    },
  ],
]);
const change = vi.fn();
const renderChapter = (
  chapter: 8 | 9,
  overrides: Partial<ComponentProps<typeof DraftingGridPericope>> = {}
) => {
  const source = chapter === 8 ? chapter8 : chapter9;
  return render(
    <DraftingGridPericope
      activeVerseId={chapter === 8 ? 31 : 1}
      aiSuggestions={{}}
      bibleVerseMap={new Map()}
      contextChapters={contextChapters}
      fullPericopes={[fullGroup]}
      globalNextUntouchedVerse={null}
      handleActiveVerseChange={vi.fn()}
      handleKeyDown={vi.fn()}
      handleNextClick={vi.fn(async () => {})}
      handleNextPericopeClick={vi.fn(async () => {})}
      handleTextChange={change}
      isAiActive={false}
      isAiThresholdMet={false}
      isTranslationComplete={false}
      pericopes={[
        { ...fullGroup, verses: fullGroup.verses.filter(v => v.chapterNumber === chapter) },
      ]}
      projectItem={
        { bookCode: 'MRK', chapterNumber: chapter, chapterAssignmentId: chapter } as ProjectItem
      }
      readOnly={false}
      selectedPanel={1}
      sourceVerses={source}
      suggestionStatus='idle'
      textareaRefs={{ current: {} }}
      verseRefs={{ current: {} }}
      verses={source.map(v => ({
        verseNumber: v.verseNumber,
        content: `Draft ${chapter}:${v.verseNumber}`,
      }))}
      {...overrides}
    />
  );
};

describe('cross-chapter pericope display', () => {
  afterEach(() => {
    config.features.rtePericope = false;
    vi.clearAllMocks();
  });

  it.each([8, 9] as const)(
    'shows the complete pericope from chapter %i without confusing verse numbers',
    chapter => {
      renderChapter(chapter);
      expect(screen.getAllByRole('heading', { name: '8:31–9:1' })).toHaveLength(2);
      expect(screen.getByText('Source Mark 8:31')).toBeInTheDocument();
      expect(screen.getByText('Source Mark 8:38')).toBeInTheDocument();
      expect(screen.getByText('Source Mark 9:1')).toBeInTheDocument();
      expect(screen.queryByText('Source Mark 8:1')).not.toBeInTheDocument();
      expect(screen.getAllByRole('textbox')).toHaveLength(chapter === 8 ? 8 : 1);
    }
  );

  it('keeps neighboring draft text read-only and sends changes only for the current chapter', () => {
    renderChapter(8);
    expect(screen.getByText('Saved Mark 9:1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Translation for verse 1')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Translation for verse 31'), {
      target: { value: 'Edited 8:31' },
    });
    expect(change).toHaveBeenCalledWith(31, 'Edited 8:31');
  });
  it('keeps local resource placeholders when another group crosses a chapter boundary', () => {
    const local = {
      pericopeNumber: 'local',
      pericopeTitle: null,
      verses: [{ chapterNumber: 8, verseNumber: 1 }],
    };
    renderChapter(8, {
      selectedPanel: 2,
      fullPericopes: [local, fullGroup],
      pericopes: [
        local,
        { ...fullGroup, verses: fullGroup.verses.filter(ref => ref.chapterNumber === 8) },
      ],
    });
    const localColumn = screen.getAllByRole('heading', { name: '8:1' })[0].parentElement!;
    const placeholder = within(localColumn).getByText('No content available');
    expect(placeholder).toHaveClass('text-muted-foreground', 'text-sm');
    expect(placeholder.parentElement).toHaveClass('bg-muted');
    expect(within(localColumn).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: '8:31–9:1' })).toHaveLength(2);
    expect(screen.getByText('Saved Mark 9:1')).toBeInTheDocument();
  });

  it('distinguishes missing resource verses from scripture text', () => {
    renderChapter(8, { selectedPanel: 2, bibleVerseMap: new Map([[31, 'Reference Mark 8:31']]) });
    expect(screen.getByText('Reference Mark 8:31')).not.toHaveClass('text-muted-foreground');
    for (const placeholder of screen.getAllByText('No content available')) {
      expect(placeholder).toHaveClass('text-muted-foreground', 'text-sm');
    }
  });

  it('shows loading for neighboring reference verses while the Bible selection is pending', () => {
    renderChapter(8, { selectedPanel: 2, resourceBibleLoading: true });
    const referenceGroup = screen.getByRole('button', { name: /8:31.*Loading/ });
    expect(within(referenceGroup).getAllByText('Loading...')).toHaveLength(9);
    expect(within(referenceGroup).queryByText('No content available')).not.toBeInTheDocument();
  });

  it('keeps each neighboring chapter loading state independent', () => {
    const group = {
      ...fullGroup,
      verses: [{ chapterNumber: 7, verseNumber: 1 }, ...fullGroup.verses],
    };
    const chapters = new Map([
      [7, { sourceVerses: [], targetVerses: [], isLoading: false, isError: true }],
      [9, { sourceVerses: [], targetVerses: [], isLoading: true, isError: false }],
    ]);
    render(
      <>
        <PericopeContextText chapters={chapters} currentChapter={8} group={group} side='before' />
        <PericopeContextText chapters={chapters} currentChapter={8} group={group} side='after' />
      </>
    );
    expect(
      within(screen.getByText('7:1').closest('section')!).getByText('No content available')
    ).toBeInTheDocument();
    expect(
      within(screen.getByText('9:1').closest('section')!).getByText('Loading...')
    ).toBeInTheDocument();
  });

  it('keeps saved context beside unavailable verses without labeling them undrafted', () => {
    const group = {
      ...fullGroup,
      verses: [...fullGroup.verses, { chapterNumber: 9, verseNumber: 2 }],
    };
    render(
      <PericopeContextText
        chapters={contextChapters}
        currentChapter={8}
        group={group}
        side='after'
      />
    );
    expect(screen.getByText('Saved Mark 9:1')).toBeInTheDocument();
    expect(screen.getByText('No content available')).toBeInTheDocument();
    expect(screen.queryByText('Not drafted')).not.toBeInTheDocument();
  });

  const unavailableContentCases = [
    { description: 'empty text at rest', content: '', loading: false },
    { description: 'whitespace at rest', content: ' \t\n ', loading: false },
    { description: 'empty text while pending', content: '', loading: true },
    { description: 'whitespace while pending', content: ' \t\n ', loading: true },
  ];

  it.each(unavailableContentCases)(
    'shows muted source placeholders for $description in the current and neighboring chapters',
    ({ content, loading }) => {
      renderChapter(8, {
        sourceVerses: chapter8.map(verse =>
          verse.verseNumber === 31 ? { ...verse, text: content } : verse
        ),
        contextChapters: new Map([
          [
            9,
            {
              ...contextChapters.get(9)!,
              sourceVerses: [{ ...chapter9[0], text: content }],
              isLoading: loading,
            },
          ],
        ]),
      });
      const sourceColumn = screen.getAllByRole('heading', { name: '8:31–9:1' })[0].parentElement!;
      const currentText = within(sourceColumn).getByText('8:31').nextElementSibling!;
      const neighborText = within(sourceColumn).getByText('9:1').nextElementSibling!;

      expect(currentText.textContent).toBe('No content available');
      expect(neighborText.textContent).toBe(loading ? 'Loading...' : 'No content available');
      expect(currentText).toHaveClass('text-muted-foreground', 'text-sm');
      expect(neighborText).toHaveClass('text-muted-foreground', 'text-sm');
    }
  );

  it.each(unavailableContentCases)(
    'shows muted resource placeholders for $description',
    ({ content, loading }) => {
      renderChapter(8, {
        selectedPanel: 2,
        bibleVerseMap: new Map([[31, content]]),
        resourceBibleLoading: loading,
      });
      const resourceColumn = screen.getAllByRole('heading', { name: '8:31–9:1' })[0].parentElement!;
      const resourceText = within(resourceColumn).getByText('8:31').nextElementSibling!;

      expect(resourceText.textContent).toBe(loading ? 'Loading...' : 'No content available');
      expect(resourceText).toHaveClass('text-muted-foreground', 'text-sm');
    }
  );

  it.each([1, 2] as const)(
    'preserves surrounding whitespace in available scripture text on panel %i',
    selectedPanel => {
      const content = '  Scripture text with surrounding whitespace \t\n ';
      renderChapter(8, {
        selectedPanel,
        sourceVerses: chapter8.map(verse =>
          verse.verseNumber === 31 ? { ...verse, text: content } : verse
        ),
        bibleVerseMap: new Map([[31, content]]),
        contextChapters: new Map([
          [
            9,
            {
              ...contextChapters.get(9)!,
              sourceVerses: [{ ...chapter9[0], text: content }],
            },
          ],
        ]),
      });
      const scriptureColumn = screen.getAllByRole('heading', { name: '8:31–9:1' })[0]
        .parentElement!;
      const currentText = within(scriptureColumn).getByText('8:31').nextElementSibling!;

      expect(currentText.textContent).toBe(content);
      expect(currentText).not.toHaveClass('text-muted-foreground');
      if (selectedPanel === 1) {
        const neighborText = within(scriptureColumn).getByText('9:1').nextElementSibling!;
        expect(neighborText.textContent).toBe(content);
        expect(neighborText).not.toHaveClass('text-muted-foreground');
      }
    }
  );
});
