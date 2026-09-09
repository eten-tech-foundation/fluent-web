import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChapterAssignmentStatus, type ProjectItem, type Source } from '@/lib/types';

import { SOURCE_BIBLE_TAB_ID, type ResourceBibleTab } from './BibleTabList';
import { DraftingChapterView } from './DraftingChapterView';

vi.mock('@/features/rte/components/ChapterEditor', () => ({
  ChapterEditor: ({ targetLanguage }: { targetLanguage: string }) => (
    <div data-testid='chapter-editor'>
      <h3>{targetLanguage}</h3>
    </div>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'noContentAvailable'
        ? "This Bible verse doesn't have content for this passage."
        : key,
  }),
}));

const projectItem: ProjectItem = {
  chapterAssignmentId: 1,
  projectId: 100,
  projectName: 'Spanish Project',
  projectUnitId: 10,
  bibleId: 1,
  bibleName: 'WEB',
  targetLanguage: 'Spanish',
  targetLangCode: 'spa',
  bookId: 1,
  book: 'Genesis',
  chapterStatus: ChapterAssignmentStatus.DRAFT,
  chapterNumber: 1,
  totalVerses: 2,
  completedVerses: 0,
  submittedTime: null,
  bookCode: 'GEN',
  sourceLangCode: 'eng',
};

const sourceVerses: Source[] = [
  { id: 101, verseNumber: 1, text: 'In the beginning.' },
  { id: 102, verseNumber: 2, text: 'The earth was formless.' },
];

const resourceBibleTabs: ResourceBibleTab[] = [
  {
    id: 'aq-alternative',
    label: 'Alternative Bible',
    language: 'eng',
    verses: [{ verseNumber: 1, text: 'Alternative beginning.' }],
    isLoading: false,
  },
  { id: 'yv-empty', label: 'Empty Bible', language: 'eng', verses: [], isLoading: false },
];

const commonProps = {
  sourceVerses,
  verses: [],
  projectItem,
  readOnly: false,
  bibleVerseMap: new Map<number, string>(),
  resourceBibleTabs,
  bibleContentLoading: false,
  handleTextChange: vi.fn(),
  handleActiveVerseChange: vi.fn(),
  onBibleTabSelect: vi.fn(),
  onBibleTabClose: vi.fn(),
};

describe('DraftingChapterView', () => {
  it('always names the source Bible and target language', () => {
    render(
      <DraftingChapterView
        {...commonProps}
        activeBibleTabId={SOURCE_BIBLE_TAB_ID}
        selectedPanel={1}
      />
    );

    expect(screen.getByRole('tab', { name: 'WEB' })).toBeInTheDocument();
    expect(screen.getByText('Spanish')).toBeInTheDocument();
    expect(screen.getByText('In the beginning.')).toBeInTheDocument();
    expect(screen.getByTestId('chapter-editor')).toBeInTheDocument();
  });

  it('keeps the source tab available when a resource Bible has no passage content', () => {
    render(<DraftingChapterView {...commonProps} activeBibleTabId='yv-empty' selectedPanel={2} />);

    expect(screen.getByRole('tab', { name: 'WEB' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alternative Bible' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Empty Bible' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(
      screen.getByText("This Bible verse doesn't have content for this passage.")
    ).toBeInTheDocument();
  });

  it('returns to the source without removing either resource tab', async () => {
    const user = userEvent.setup();
    const onBibleTabSelect = vi.fn();
    const { rerender } = render(
      <DraftingChapterView
        {...commonProps}
        activeBibleTabId='aq-alternative'
        bibleVerseMap={new Map([[1, 'Alternative beginning.']])}
        selectedPanel={2}
        onBibleTabSelect={onBibleTabSelect}
      />
    );

    expect(screen.getByText('Alternative beginning.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'WEB' }));
    expect(onBibleTabSelect).toHaveBeenCalledWith(SOURCE_BIBLE_TAB_ID);

    rerender(
      <DraftingChapterView
        {...commonProps}
        activeBibleTabId={SOURCE_BIBLE_TAB_ID}
        selectedPanel={1}
        onBibleTabSelect={onBibleTabSelect}
      />
    );

    expect(screen.getByText('In the beginning.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alternative Bible' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Empty Bible' })).toBeInTheDocument();
  });
});
