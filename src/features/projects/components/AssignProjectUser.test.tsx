import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as useProjectUsersModule from '@/features/projects/hooks/useProjectUsers';
import { type ChapterAssignmentProgress } from '@/lib/types';
import { fireEvent, renderWithProviders, screen } from '@/test/render';

import { AssignProjectUsers } from './AssignProjectUsers';

vi.mock('@/store/store', () => ({
  useAppStore: () => ({
    userdetail: { id: 99, username: 'admin', lastActiveOrgId: 1 },
  }),
}));

const mockRemoveMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@/features/projects/hooks/useProjectUsers', async importOriginal => {
  const actual = await importOriginal<typeof useProjectUsersModule>();
  return {
    ...actual,
    useProjectUsers: () => ({
      data: [
        {
          projectId: 1,
          userId: 10,
          displayName: 'Alice Drafter',
          roleID: 3,
          roleName: 'Project Translator',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useAddProjectUsers: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useRemoveProjectUser: () => ({ mutateAsync: mockRemoveMutateAsync, isPending: false }),
    useUpdateProjectUserRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

const mockAssignmentsWithWork: ChapterAssignmentProgress[] = [
  {
    assignmentId: 101,
    projectUnitId: 1,
    status: 'draft',
    bookNameEng: 'Genesis',
    chapterNumber: 1,
    bibleId: 1,
    bookId: 1,
    bookCode: 'GEN',
    sourceLangCode: 'eng',
    targetLangCode: 'spa',
    assignedUser: { id: 10, displayName: 'Alice Drafter' },
    peerChecker: null,
    totalVerses: 31,
    completedVerses: 5,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    submittedTime: null,
  },
];

describe('AssignProjectUsers - PR 1 Issue #462 Removal Banner', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders standard confirmation copy when member has 0 active assignments', async () => {
    renderWithProviders(
      <AssignProjectUsers chapterAssignments={[]} projectId={1} users={[]} usersLoading={false} />
    );

    const trashButtons = await screen.findAllByRole('button', { name: /Remove user/i });
    fireEvent.click(trashButtons[0]);

    expect(screen.getByText('Remove Alice Drafter from this project?')).toBeInTheDocument();
    expect(
      screen.queryByText(/Their chapter assignments will be removed/i)
    ).not.toBeInTheDocument();
  });

  it('renders extended warning banner copy when member has active assignments', async () => {
    renderWithProviders(
      <AssignProjectUsers
        chapterAssignments={mockAssignmentsWithWork}
        projectId={1}
        users={[]}
        usersLoading={false}
      />
    );

    const trashButtons = await screen.findAllByRole('button', { name: /Remove user/i });
    fireEvent.click(trashButtons[0]);

    expect(screen.getByText('Remove Alice Drafter from this project?')).toBeInTheDocument();
    expect(screen.getByText('Their chapter assignments will be removed.')).toBeInTheDocument();
  });

  it('closes banner without changes on Cancel click', async () => {
    renderWithProviders(
      <AssignProjectUsers
        chapterAssignments={mockAssignmentsWithWork}
        projectId={1}
        users={[]}
        usersLoading={false}
      />
    );

    const trashButtons = await screen.findAllByRole('button', { name: /Remove user/i });
    fireEvent.click(trashButtons[0]);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    expect(screen.queryByText(/Remove Alice Drafter from this project/i)).not.toBeInTheDocument();
  });
});
