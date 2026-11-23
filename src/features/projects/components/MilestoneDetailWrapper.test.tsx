import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChapterAssignmentProgress, type UserDetail } from '@/lib/types';
import { renderWithProviders, screen } from '@/test/render';

import { MilestoneDetailWrapper } from './MilestoneDetailWrapper';

interface ManageBooksProps {
  isOpen: boolean;
  milestoneId: number;
  projectId: number;
}

const { state, navigate, manageBooksDialog, project, milestone } = vi.hoisted(() => ({
  state: {
    userdetail: null as UserDetail | null,
    assignments: [] as ChapterAssignmentProgress[],
    books: [] as Array<{ bookId: number; code: string; engDisplayName: string }>,
  },
  navigate: vi.fn(),
  manageBooksDialog: vi.fn((_props: ManageBooksProps) => null),
  project: {
    id: 5,
    name: 'Translation project',
    organization: 1,
    isActive: true,
    createdBy: 1,
    createdAt: null,
    updatedAt: null,
    metadata: {},
    sourceLanguageName: 'English',
    targetLanguageName: 'Spanish',
    sourceName: 'World English Bible',
    chapterStatusCounts: {},
    workflowConfig: [],
    lastActivityAt: null,
    lastChapterActivity: null,
    sourceBibleId: 20,
  },
  milestone: {
    id: 10,
    name: 'New Testament',
    status: 'active',
    type: 'standard',
    projectId: 5,
    projectName: 'Translation project',
    milestoneCount: 1,
    bookCount: 1,
    bookIds: [30],
    chapterStatusCounts: {},
    updatedAt: '2026-11-20T10:00:00.000Z',
  },
}));

// The menu labels come from the shipped English locale, so the tests read what users see.
vi.mock('react-i18next', async () => {
  const { default: enCommon } = await import('../../../../public/locales/en/common.json');
  const messages: Record<string, unknown> = enCommon;
  return {
    useTranslation: () => ({
      t: (key: string) => {
        const message = messages[key];
        return typeof message === 'string' ? message : key;
      },
    }),
  };
});
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ projectId: '5', milestoneId: '10' }),
    useSearch: () => ({}),
  }),
  useLocation: () => ({ state: undefined }),
  useNavigate: () => navigate,
}));
vi.mock('@/store/store', () => ({ useAppStore: () => ({ userdetail: state.userdetail }) }));
vi.mock('@/features/projects/hooks/useProjectDetails', () => ({
  useProjectDetails: () => ({ data: project, isLoading: false, error: null }),
}));
vi.mock('@/features/projects/hooks/useMilestones', async importOriginal => ({
  ...(await importOriginal()),
  useGetMilestones: () => ({ data: [milestone] }),
}));
vi.mock('@/hooks/useChapterAssignment', () => ({
  useChapterAssignments: () => ({ data: state.assignments, isLoading: false, isFetching: false }),
  useAssignChapters: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock('@/features/projects/hooks/useProjectUnitBooks', () => ({
  useProjectBooks: () => ({ data: state.books, isLoading: false }),
}));
vi.mock('@/features/projects/hooks/useProjectUsers', () => ({
  useProjectUsers: () => ({ data: [], isLoading: false }),
}));
vi.mock('./ChapterAssignmentsTable', () => ({ ChapterAssignmentsTable: () => null }));
vi.mock('./AssignUsersDialog', () => ({ AssignUsersDialog: () => null }));
vi.mock('./CardProgressBar', () => ({ CardProgressBar: () => null }));
vi.mock('./ManageMilestoneBooksDialog', () => ({ ManageMilestoneBooksDialog: manageBooksDialog }));

const johnChapter3: ChapterAssignmentProgress = {
  assignmentId: 42,
  projectUnitId: 10,
  status: 'draft',
  bibleId: 20,
  textBibleKey: 'aquifer-text-20',
  selectedRecordingKey: 'recording-20',
  ttsLicenseStatus: 'allowed',
  bookId: 30,
  bookCode: 'JHN',
  bookNameEng: 'John',
  chapterNumber: 3,
  sourceLangCode: 'eng',
  targetLangCode: 'spa',
  assignedUser: { id: 7, displayName: 'Translator' },
  peerChecker: null,
  totalVerses: 36,
  completedVerses: 2,
};

/** A user whose selected role is `roleName`, granted on project 5 unless `projectId` says else. */
const userWithRole = (roleName: string, projectId: number | null = 5): UserDetail => ({
  id: 3,
  username: 'someone',
  email: 'someone@example.com',
  lastActiveOrgId: 1,
  activeRoleName: roleName,
  grants: [{ orgId: 1, projectId, roleId: 1, roleName, permissions: [] }],
});

const MENU_BUTTON = { name: 'More milestone actions' };

const renderAs = (userdetail: UserDetail) => {
  state.userdetail = userdetail;
  return renderWithProviders(<MilestoneDetailWrapper />);
};

const openMenu = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.click(screen.getByRole('button', MENU_BUTTON));
  return screen.getAllByRole('menuitem').map(item => item.textContent);
};

const modalOfLastNavigation = () =>
  (navigate.mock.lastCall?.[0] as { search?: { modal?: string } } | undefined)?.search?.modal;

describe('MilestoneDetailWrapper milestone actions menu (#542)', () => {
  beforeEach(() => {
    navigate.mockClear();
    manageBooksDialog.mockClear();
    state.assignments = [johnChapter3];
    state.books = [{ bookId: 30, code: 'JHN', engDisplayName: 'John' }];
  });

  it.each(['Project Manager', 'Org Manager'])(
    'lists Edit Book Metadata, Manage Books and Export Milestone for a %s, in that order',
    async roleName => {
      const { user } = renderAs(userWithRole(roleName, roleName === 'Org Manager' ? null : 5));

      expect(await openMenu(user)).toEqual([
        'Edit Book Metadata',
        'Manage Books',
        'Export Milestone',
      ]);
    }
  );

  it.each(['Project Translator', 'Project Observer'])(
    'shows a %s the menu with only Export Milestone',
    async roleName => {
      const { user } = renderAs(userWithRole(roleName));

      expect(await openMenu(user)).toEqual(['Export Milestone']);
    }
  );

  it('shows only Export Milestone to a Project Manager of another project', async () => {
    const { user } = renderAs(userWithRole('Project Manager', 6));

    expect(await openMenu(user)).toEqual(['Export Milestone']);
  });

  it.each(['Project Manager', 'Project Translator'])(
    'keeps no standalone metadata or export button in the header for a %s',
    roleName => {
      renderAs(userWithRole(roleName));

      expect(screen.getByRole('button', MENU_BUTTON)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /metadata/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    }
  );

  it('opens the book metadata dialog route from Edit Book Metadata', async () => {
    const { user } = renderAs(userWithRole('Project Manager'));
    await openMenu(user);

    await user.click(screen.getByRole('menuitem', { name: 'Edit Book Metadata' }));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(modalOfLastNavigation()).toBe('metadata');
  });

  it.each(['Project Manager', 'Project Observer'])(
    'opens the export dialog route from Export Milestone for a %s',
    async roleName => {
      const { user } = renderAs(userWithRole(roleName));
      await openMenu(user);

      await user.click(screen.getByRole('menuitem', { name: 'Export Milestone' }));

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(modalOfLastNavigation()).toBe('export');
    }
  );

  it('opens Manage Books for this milestone from the menu', async () => {
    const { user } = renderAs(userWithRole('Project Manager'));
    await openMenu(user);

    await user.click(screen.getByRole('menuitem', { name: 'Manage Books' }));

    expect(manageBooksDialog.mock.lastCall?.[0]).toMatchObject({
      isOpen: true,
      milestoneId: 10,
      projectId: 5,
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('disables Edit Book Metadata and Export Milestone while the milestone has no chapters, but not Manage Books', async () => {
    state.assignments = [];
    state.books = [];
    const { user } = renderAs(userWithRole('Project Manager'));
    await openMenu(user);

    const editItem = screen.getByRole('menuitem', { name: 'Edit Book Metadata' });
    const exportItem = screen.getByRole('menuitem', { name: 'Export Milestone' });
    expect(editItem).toHaveAttribute('aria-disabled', 'true');
    expect(exportItem).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Manage Books' })).not.toHaveAttribute(
      'aria-disabled'
    );

    await user.click(editItem);
    await user.click(exportItem);
    expect(navigate).not.toHaveBeenCalled();
  });
});
