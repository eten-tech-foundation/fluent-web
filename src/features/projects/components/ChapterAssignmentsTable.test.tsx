import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as useTruncationModule from '@/features/projects/hooks/useTruncation';
import { type ChapterAssignmentProgress } from '@/lib/types';
import { renderWithProviders, screen } from '@/test/render';

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
});
