import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES, type UserDetail } from '@/lib/types';
import { renderWithProviders, screen } from '@/test/render';

import { MilestoneDetailWrapper } from './MilestoneDetailWrapper';

const { state, chapterTable, project, milestone } = vi.hoisted(() => ({
  state: { userdetail: null as UserDetail | null },
  chapterTable: vi.fn((_props: { isManager: boolean }) => null),
  // Project 5 belongs to organization 3, which the Super Admin is no member of.
  project: {
    id: 5,
    name: 'Kukna NT',
    organization: 3,
    isActive: true,
    createdBy: 1,
    createdAt: null,
    updatedAt: null,
    metadata: {},
    sourceLanguageName: 'Gujarati',
    targetLanguageName: 'Kukna',
    sourceName: 'IRV Gujarati',
    chapterStatusCounts: {},
    workflowConfig: [],
    lastActivityAt: null,
    lastChapterActivity: null,
    sourceBibleId: 1,
  },
  milestone: {
    id: 10,
    name: 'Gospels',
    status: 'active',
    type: 'standard',
    projectId: 5,
    projectName: 'Kukna NT',
    milestoneCount: 1,
    bookCount: 1,
    bookIds: [43],
    chapterStatusCounts: {},
    updatedAt: '2026-11-20T10:00:00.000Z',
  },
}));

// Labels come from the shipped English locale, so the tests read what users see.
vi.mock('react-i18next', async () => {
  const { default: enCommon } = await import('../../../../public/locales/en/common.json');
  const messages: Record<string, unknown> = enCommon;
  return {
    useTranslation: () => ({
      t: (key: string, options?: unknown) => {
        const message = messages[key];
        if (typeof message === 'string') return message;
        return typeof options === 'string' ? options : key;
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
  useNavigate: () => vi.fn(),
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
  useChapterAssignments: () => ({ data: [], isLoading: false, isFetching: false }),
  useAssignChapters: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock('@/features/projects/hooks/useProjectUnitBooks', () => ({
  useProjectBooks: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/features/projects/hooks/useProjectUsers', () => ({
  useProjectUsers: () => ({ data: [], isLoading: false }),
}));
vi.mock('./ChapterAssignmentsTable', () => ({ ChapterAssignmentsTable: chapterTable }));
vi.mock('./AssignUsersDialog', () => ({ AssignUsersDialog: () => null }));
vi.mock('./CardProgressBar', () => ({ CardProgressBar: () => null }));

const renderAs = (userdetail: UserDetail) => {
  state.userdetail = userdetail;
  return renderWithProviders(<MilestoneDetailWrapper />);
};

describe('MilestoneDetailWrapper for a Super Admin (#566)', () => {
  beforeEach(() => {
    chapterTable.mockClear();
  });

  it('gives a Super Admin the Org Manager controls: Assign and the chapter checkboxes', () => {
    renderAs({
      id: 1,
      username: 'superadmin',
      email: 'sa@example.com',
      activeRoleName: null,
      lastActiveOrgId: null,
      grants: [
        { orgId: null, projectId: null, roleId: 1, roleName: ROLES.SUPER_ADMIN, permissions: [] },
      ],
    });

    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(chapterTable.mock.lastCall?.[0].isManager).toBe(true);
  });

  it('keeps them away from a Project Translator', () => {
    renderAs({
      id: 2,
      username: 'translator',
      email: 't@example.com',
      activeRoleName: ROLES.PROJECT_TRANSLATOR,
      lastActiveOrgId: 3,
      grants: [
        { orgId: 3, projectId: 5, roleId: 5, roleName: ROLES.PROJECT_TRANSLATOR, permissions: [] },
      ],
    });

    expect(screen.queryByRole('button', { name: 'Assign' })).not.toBeInTheDocument();
    expect(chapterTable.mock.lastCall?.[0].isManager).toBe(false);
  });
});
