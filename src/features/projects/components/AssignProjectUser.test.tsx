import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as useProjectUsersModule from '@/features/projects/hooks/useProjectUsers';
import { ROLES, type ChapterAssignmentProgress, type User } from '@/lib/types';
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

describe('AssignProjectUsers - Issue #559 Org Manager project user visibility', () => {
  const orgUsers: User[] = [
    {
      id: 10,
      username: 'alice',
      displayName: 'Alice Drafter',
      email: 'alice@example.com',
      role: 'Project Translator',
      orgGrants: [{ orgId: 1, roleId: 3, roleName: 'Project Translator', permissions: [] }],
    },
    {
      id: 20,
      username: 'bob_org_manager',
      displayName: 'Bob OrgManager',
      email: 'bob@example.com',
      role: ROLES.ORG_MANAGER,
      orgGrants: [{ orgId: 1, roleId: 1, roleName: ROLES.ORG_MANAGER, permissions: [] }],
    },
  ];

  it('negative test: does not list an Org Manager who was not explicitly added to the project', async () => {
    renderWithProviders(
      <AssignProjectUsers
        chapterAssignments={[]}
        projectId={1}
        users={orgUsers}
        usersLoading={false}
      />
    );

    // Alice is an explicitly added project user and appears in the table
    expect(screen.getByText('Alice Drafter')).toBeInTheDocument();
    // Bob is an Org Manager with only an org grant and must NOT appear in the table
    expect(screen.queryByText('Bob OrgManager')).not.toBeInTheDocument();
  });

  it('positive test: Org Manager not yet added to project appears in the "Add User" dropdown', async () => {
    renderWithProviders(
      <AssignProjectUsers
        isAddUserOpen
        chapterAssignments={[]}
        projectId={1}
        users={orgUsers}
        usersLoading={false}
      />
    );

    // Click the user selector trigger button
    const selectTriggerSpan = screen.getByText('Select user(s)');
    const selectTriggerBtn = selectTriggerSpan.closest('button') ?? selectTriggerSpan;
    fireEvent.pointerDown(selectTriggerBtn);
    fireEvent.click(selectTriggerBtn);

    // Unassigned Org Manager Bob appears in the options
    expect(await screen.findByText('bob_org_manager')).toBeInTheDocument();
    // Alice is already in the project so she should not appear in the available dropdown options
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
  });

  it('negative test: filters out Org Manager rows if returned by legacy API and surfaces them in Add User dropdown', async () => {
    const useProjectUsersModuleActual = await import('@/features/projects/hooks/useProjectUsers');
    const spy = vi.spyOn(useProjectUsersModuleActual, 'useProjectUsers');
    spy.mockReturnValue({
      data: [
        {
          projectId: 1,
          userId: 10,
          displayName: 'Alice Drafter',
          roleID: 3,
          roleName: 'Project Translator',
        },
        {
          projectId: 1,
          userId: 20,
          displayName: 'Bob OrgManager',
          roleID: 1,
          roleName: ROLES.ORG_MANAGER,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(
      <AssignProjectUsers
        isAddUserOpen
        chapterAssignments={[]}
        projectId={1}
        users={orgUsers}
        usersLoading={false}
      />
    );

    // In the table: Alice is present, but Bob (Org Manager) is filtered out
    expect(screen.getByText('Alice Drafter')).toBeInTheDocument();
    expect(screen.queryByText('Bob OrgManager')).not.toBeInTheDocument();

    // In the Add User dropdown: Bob is available to add
    const selectTriggerSpan = screen.getByText('Select user(s)');
    const selectTriggerBtn = selectTriggerSpan.closest('button') ?? selectTriggerSpan;
    fireEvent.pointerDown(selectTriggerBtn);
    fireEvent.click(selectTriggerBtn);

    expect(await screen.findByText('bob_org_manager')).toBeInTheDocument();
  });
});
