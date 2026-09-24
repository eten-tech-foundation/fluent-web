import { describe, expect, it, vi } from 'vitest';

import { type ChapterAssignmentProgress } from '@/lib/types';
import { renderWithProviders, screen } from '@/test/render';

import { ChapterAssignmentsTable } from './ChapterAssignmentsTable';

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
});
