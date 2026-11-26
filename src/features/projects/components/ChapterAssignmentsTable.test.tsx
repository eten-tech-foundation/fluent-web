import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as useTruncationModule from '@/features/projects/hooks/useTruncation';
import { type ChapterAssignmentProgress } from '@/lib/types';
import { renderWithProviders, screen, within } from '@/test/render';

import { ChapterAssignmentsTable } from './ChapterAssignmentsTable';

const { mockRoleLabels } = vi.hoisted(() => ({
  mockRoleLabels: {
    draft: 'Drafter',
    peer_check: 'Peer Checker',
  } as Record<string, string>,
}));

vi.mock('@/features/projects/hooks/useProjectWorkflow', () => ({
  useProjectWorkflow: vi.fn(() => ({
    workflowSteps: [],
    isLoading: false,
    getStageLabel: (_stageId: string, fallback: string) => fallback,
    getRoleLabel: (stageId: string, fallback: string) => mockRoleLabels[stageId] ?? fallback,
  })),
}));

const mockAssignment: ChapterAssignmentProgress = {
  bibleId: 1,
  bookId: 1,
  bookCode: 'GEN',
  sourceLangCode: 'eng',
  targetLangCode: 'eng',
  bookNameEng: 'Genesis',
  chapterNumber: 1,
  assignedUser: { id: 1, displayName: 'John Doe' },
  peerChecker: { id: 2, displayName: 'Jane Doe' },
  status: 'In Progress',
  projectUnitId: 10,
  assignmentId: 100,
  totalVerses: 31,
  completedVerses: 10,
  hasConflict: false,
};

describe('ChapterAssignmentsTable', () => {
  beforeEach(() => {
    mockRoleLabels.draft = 'Drafter';
    mockRoleLabels.peer_check = 'Peer Checker';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const defaultProps = {
    assignments: [mockAssignment],
    isLoading: false,
    selectedBook: 'all',
    isManager: true,
    selectedAssignments: [],
    isRowActionsDisabled: false,
    onRowClick: vi.fn(),
    onCheckboxChange: vi.fn(),
  };

  it('renders conflict indicator icon for PM when chapter has conflict', () => {
    const assignmentsWithConflict = [{ ...mockAssignment, hasConflict: true }];
    renderWithProviders(
      <ChapterAssignmentsTable
        {...defaultProps}
        assignments={assignmentsWithConflict}
        isManager={true}
      />
    );

    expect(screen.getByLabelText('Audio conflict')).toBeInTheDocument();
  });

  it('conflict indicator has role="img" and accessible name for AT users', () => {
    const assignmentsWithConflict = [{ ...mockAssignment, hasConflict: true }];
    renderWithProviders(
      <ChapterAssignmentsTable
        {...defaultProps}
        assignments={assignmentsWithConflict}
        isManager={true}
      />
    );

    const indicator = screen.getByRole('img', { name: 'Audio conflict' });
    expect(indicator).toBeInTheDocument();
  });

  it('conflict indicator is keyboard-focusable (tabIndex=0)', () => {
    const assignmentsWithConflict = [{ ...mockAssignment, hasConflict: true }];
    renderWithProviders(
      <ChapterAssignmentsTable
        {...defaultProps}
        assignments={assignmentsWithConflict}
        isManager={true}
      />
    );

    const indicator = screen.getByRole('img', { name: 'Audio conflict' });
    expect(indicator).toHaveAttribute('tabindex', '0');
  });

  it('does NOT render conflict indicator icon for translator when chapter has conflict', () => {
    const assignmentsWithConflict = [{ ...mockAssignment, hasConflict: true }];
    renderWithProviders(
      <ChapterAssignmentsTable
        {...defaultProps}
        assignments={assignmentsWithConflict}
        isManager={false}
      />
    );

    expect(screen.queryByLabelText('Audio conflict')).not.toBeInTheDocument();
  });

  it('does NOT render conflict indicator icon when chapter has no conflict', () => {
    renderWithProviders(
      <ChapterAssignmentsTable
        {...defaultProps}
        assignments={[{ ...mockAssignment, hasConflict: false }]}
        isManager={true}
      />
    );

    expect(screen.queryByLabelText('Audio conflict')).not.toBeInTheDocument();
  });

  it('hides row selection checkboxes and select column when isManager is false, and keeps drafter/checker text', () => {
    renderWithProviders(
      <ChapterAssignmentsTable {...defaultProps} assignments={[mockAssignment]} isManager={false} />
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Select')).not.toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('renders row selection checkboxes and select column when isManager is true', () => {
    renderWithProviders(
      <ChapterAssignmentsTable {...defaultProps} assignments={[mockAssignment]} isManager={true} />
    );

    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByText('Select')).toBeInTheDocument();
  });

  it('renders long workflow stage names in headers with truncation classes and shrink-0 on sort icon', async () => {
    const longDrafterName = 'Extremely Long Custom Workflow Drafter Role Name That Should Truncate';
    const longCheckerName =
      'Extremely Long Custom Peer Review Checker Role Name That Should Truncate';

    mockRoleLabels.draft = longDrafterName;
    mockRoleLabels.peer_check = longCheckerName;

    const { user } = renderWithProviders(<ChapterAssignmentsTable {...defaultProps} />);

    const drafterText = screen.getByText(longDrafterName);
    expect(drafterText).toBeInTheDocument();
    expect(drafterText).toHaveClass('truncate', 'min-w-0', 'max-w-full');

    const checkerText = screen.getByText(longCheckerName);
    expect(checkerText).toBeInTheDocument();
    expect(checkerText).toHaveClass('truncate', 'min-w-0', 'max-w-full');

    const drafterButton = drafterText.closest('button');
    expect(drafterButton).toHaveClass('flex', 'max-w-full', 'min-w-0');

    const drafterTh = drafterButton?.closest('th');
    expect(drafterTh).toHaveClass('overflow-hidden');

    const sortSvg = drafterButton?.querySelector('svg');
    expect(sortSvg).toHaveClass('shrink-0');

    // Clicking sort still updates aria-sort
    expect(drafterTh).not.toHaveAttribute('aria-sort');
    await user.click(drafterButton!);
    expect(drafterTh).toHaveAttribute('aria-sort', 'ascending');
  });

  it('opens tooltip when sort button is focused by keyboard if header text is truncated', async () => {
    vi.spyOn(useTruncationModule, 'useTruncation').mockReturnValue({
      ref: vi.fn(),
      isTruncated: true,
    });

    renderWithProviders(<ChapterAssignmentsTable {...defaultProps} />);

    const drafterButton = screen.getByRole('button', { name: /drafter/i });
    drafterButton.focus();

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Drafter');
  });

  describe('row order', () => {
    const row = (
      assignmentId: number,
      bookId: number,
      bookCode: string,
      bookNameEng: string,
      chapterNumber: number
    ): ChapterAssignmentProgress => ({
      ...mockAssignment,
      assignmentId,
      bookId,
      bookCode,
      bookNameEng,
      chapterNumber,
      assignedUser: null,
      peerChecker: null,
      status: 'not_started',
    });

    // Book ids are the API's book ids (Genesis 1 to Revelation 66). The API sends the rows sorted
    // by book name, so this list starts with 1 Chronicles; the chapters are out of order on purpose.
    const apiRows = [
      row(101, 13, '1CH', '1 Chronicles', 10),
      row(102, 13, '1CH', '1 Chronicles', 4),
      row(103, 62, '1JN', '1 John', 1),
      row(104, 9, '1SA', '1 Samuel', 1),
      row(105, 12, '2KI', '2 Kings', 3),
      row(106, 1, 'GEN', 'Genesis', 10),
      row(107, 1, 'GEN', 'Genesis', 2),
      row(108, 66, 'REV', 'Revelation', 1),
    ];

    const bibleOrder = [
      'Genesis 2',
      'Genesis 10',
      '1 Samuel 1',
      '2 Kings 3',
      '1 Chronicles 4',
      '1 Chronicles 10',
      '1 John 1',
      'Revelation 1',
    ];

    const reversedBooks = [
      'Revelation 1',
      '1 John 1',
      '1 Chronicles 4',
      '1 Chronicles 10',
      '2 Kings 3',
      '1 Samuel 1',
      'Genesis 2',
      'Genesis 10',
    ];

    const renderRows = (assignments: ChapterAssignmentProgress[] = apiRows) =>
      renderWithProviders(
        <ChapterAssignmentsTable {...defaultProps} assignments={assignments} isManager={false} />
      );

    /** "Book Chapter" for each body row, top to bottom. */
    const visibleOrder = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map(tableRow => {
          const [book, chapter] = within(tableRow).getAllByRole('cell');
          return `${book.textContent} ${chapter.textContent}`;
        });

    const headerButton = (name: string) => screen.getByRole('button', { name });
    const headerCell = (name: string) => headerButton(name).closest('th');

    it('lists books in Bible order and chapters in numeric order by default', () => {
      renderRows();

      expect(visibleOrder()).toEqual(bibleOrder);
    });

    it('keeps the arrow-up-down icon on the Book header at rest and reports the default sort as ascending', () => {
      renderRows();

      expect(headerButton('Book').querySelector('svg')).toHaveClass('lucide-arrow-up-down');
      expect(headerCell('Book')).toHaveAttribute('aria-sort', 'ascending');
    });

    it('reverses the books on a Book click and keeps chapters ascending inside each book', async () => {
      const { user } = renderRows();

      await user.click(headerButton('Book'));

      expect(visibleOrder()).toEqual(reversedBooks);
      expect(headerCell('Book')).toHaveAttribute('aria-sort', 'descending');
    });

    it('goes back to Bible order on the next Book click', async () => {
      const { user } = renderRows();

      await user.click(headerButton('Book'));
      await user.click(headerButton('Book'));

      expect(visibleOrder()).toEqual(bibleOrder);
      expect(headerCell('Book')).toHaveAttribute('aria-sort', 'ascending');
    });

    it('clears another column sort on a Book click, then reverses the books on the next one', async () => {
      const statuses: Record<number, string> = { 103: 'draft', 108: 'complete' };
      const { user } = renderRows(
        apiRows.map(r => ({ ...r, status: statuses[r.assignmentId] ?? 'not_started' }))
      );

      await user.click(headerButton('Status'));
      expect(visibleOrder()).toEqual([
        'Revelation 1',
        '1 John 1',
        'Genesis 2',
        'Genesis 10',
        '1 Samuel 1',
        '2 Kings 3',
        '1 Chronicles 4',
        '1 Chronicles 10',
      ]);
      expect(headerCell('Book')).not.toHaveAttribute('aria-sort');

      await user.click(headerButton('Book'));
      expect(visibleOrder()).toEqual(bibleOrder);
      expect(headerCell('Status')).not.toHaveAttribute('aria-sort');
      expect(headerCell('Book')).toHaveAttribute('aria-sort', 'ascending');

      await user.click(headerButton('Book'));
      expect(visibleOrder()).toEqual(reversedBooks);
    });

    it('keeps ties on a sorted column in Bible order, with unassigned rows last', async () => {
      const ana = { id: 7, displayName: 'Ana' };
      const bruno = { id: 8, displayName: 'Bruno' };
      const drafters: Record<number, typeof ana> = { 104: ana, 106: ana, 108: bruno };
      const { user } = renderRows(
        apiRows.map(r => ({ ...r, assignedUser: drafters[r.assignmentId] ?? null }))
      );
      const unassigned = [
        'Genesis 2',
        '2 Kings 3',
        '1 Chronicles 4',
        '1 Chronicles 10',
        '1 John 1',
      ];

      await user.click(headerButton('Drafter'));
      expect(visibleOrder()).toEqual(['Genesis 10', '1 Samuel 1', 'Revelation 1', ...unassigned]);

      await user.click(headerButton('Drafter'));
      expect(visibleOrder()).toEqual(['Revelation 1', 'Genesis 10', '1 Samuel 1', ...unassigned]);

      await user.click(headerButton('Drafter'));
      expect(visibleOrder()).toEqual(bibleOrder);
    });
  });
});
