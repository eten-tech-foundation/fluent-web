import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DraftingGridPericope } from '@/features/bible/components/DraftingGridPericope';
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
  [8, { sourceVerses: chapter8, targetVerses: [{ verseNumber: 31, content: 'Saved Mark 8:31' }] }],
  [9, { sourceVerses: chapter9, targetVerses: [{ verseNumber: 1, content: 'Saved Mark 9:1' }] }],
]);
const change = vi.fn();
const renderChapter = (chapter: 8 | 9) => {
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
});
