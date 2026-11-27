import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES, type UserDetail, type UserGrant } from '@/lib/types';
import { renderWithProviders, screen } from '@/test/render';

import { ProjectDetailWrapper } from './ProjectDetailWrapper';

const { state, navigate, assignProjectUsers, project } = vi.hoisted(() => ({
  state: {
    userdetail: null as UserDetail | null,
    locationState: undefined as { from?: string } | undefined,
  },
  navigate: vi.fn(),
  assignProjectUsers: vi.fn((_props: Record<string, unknown>) => null),
  // Project 5 belongs to organization 3.
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
    useParams: () => ({ projectId: '5' }),
    useSearch: () => ({}),
  }),
  useLocation: () => ({ state: state.locationState }),
  useNavigate: () => navigate,
}));
vi.mock('@/store/store', () => ({
  useAppStore: (selector?: (store: unknown) => unknown) => {
    const store = { userdetail: state.userdetail, setRoleChangeWarning: vi.fn() };
    return selector ? selector(store) : store;
  },
}));
vi.mock('@/features/projects/hooks/useProjectDetails', () => ({
  useProjectDetails: () => ({ data: project, isLoading: false, error: null }),
}));
vi.mock('@/features/projects/hooks/useMilestones', async importOriginal => ({
  ...(await importOriginal()),
  useGetMilestones: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/features/projects/hooks/useProjectUnitBooks', () => ({
  useProjectBooks: () => ({ data: [] }),
}));
vi.mock('@/features/projects/hooks/useProjectWorkflow', () => ({
  useProjectWorkflow: () => ({ workflowConfig: [] }),
}));
vi.mock('@/hooks/useChapterAssignment', () => ({
  useChapterAssignments: () => ({ data: [] }),
}));
vi.mock('@/hooks/useUsers', () => ({
  useUsers: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/features/organizations/hooks/useOrganizations', () => ({
  useOrganization: (orgId: number | undefined) => ({
    data: orgId === 3 ? { id: 3, name: 'BCS', createdAt: null, orgManagerCount: 1 } : undefined,
  }),
}));
vi.mock('./AssignProjectUsers', () => ({ AssignProjectUsers: assignProjectUsers }));
vi.mock('./AddMilestoneDialog', () => ({ AddMilestoneDialog: () => null }));
vi.mock('./ManageWorkflowDialog', () => ({ ManageWorkflowDialog: () => null }));
vi.mock('./CardProgressBar', () => ({ CardProgressBar: () => null }));

const grant = (orgId: number | null, projectId: number | null, roleName: string): UserGrant => ({
  orgId,
  projectId,
  roleId: 1,
  roleName,
  permissions: [],
});

/** A global Super Admin: no organization of their own, so no role selected. */
const superAdmin: UserDetail = {
  id: 1,
  username: 'superadmin',
  email: 'sa@example.com',
  activeRoleName: null,
  lastActiveOrgId: null,
  grants: [grant(null, null, ROLES.SUPER_ADMIN)],
};

const withRole = (roleName: string, projectId: number | null): UserDetail => ({
  id: 2,
  username: 'someone',
  email: 'someone@example.com',
  activeRoleName: roleName,
  lastActiveOrgId: 3,
  grants: [grant(3, projectId, roleName)],
});

const renderAs = (userdetail: UserDetail, locationState?: { from?: string }) => {
  state.userdetail = userdetail;
  state.locationState = locationState;
  return renderWithProviders(<ProjectDetailWrapper />);
};

describe('ProjectDetailWrapper for a Super Admin (#566)', () => {
  beforeEach(() => {
    navigate.mockClear();
    assignProjectUsers.mockClear();
  });

  it('gives a Super Admin the Org Manager controls on the project', () => {
    renderAs(superAdmin);

    expect(screen.getByRole('button', { name: 'Add Milestone' })).toBeInTheDocument();
    expect(assignProjectUsers).toHaveBeenCalled();
    expect(assignProjectUsers.mock.lastCall?.[0]).toMatchObject({
      projectId: 5,
      organizationId: 3,
      organizationName: 'BCS',
    });
    // Manage Workflow stays with Project Managers, as it does for an Org Manager.
    expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
  });

  it('keeps the page read only for a Project Translator', () => {
    renderAs(withRole(ROLES.PROJECT_TRANSLATOR, 5));

    expect(screen.queryByRole('button', { name: 'Add Milestone' })).not.toBeInTheDocument();
    expect(assignProjectUsers).not.toHaveBeenCalled();
  });

  it('gives a Project Manager of the project the team panel, for the project organization', () => {
    renderAs(withRole(ROLES.PROJECT_MANAGER, 5));

    expect(screen.getByRole('button', { name: 'Add Milestone' })).toBeInTheDocument();
    expect(assignProjectUsers.mock.lastCall?.[0]).toMatchObject({
      projectId: 5,
      organizationId: 3,
    });
  });

  it('takes a Super Admin back to the Projects tab of the project organization', async () => {
    const { user } = renderAs(superAdmin);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(navigate).toHaveBeenCalledWith({
      to: '/organizations/$orgId',
      params: { orgId: '3' },
      search: { tab: 'projects' },
      replace: true,
    });
  });

  it('takes a Super Admin back where the page was opened from, when the navigation says so', async () => {
    // A Super Admin who also manages an organization can open a project from its /projects list.
    const { user } = renderAs(superAdmin, { from: '/projects' });

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ to: '/projects', replace: true });
  });

  it('still takes a Project Manager back to the Projects list', async () => {
    const { user } = renderAs(withRole(ROLES.PROJECT_MANAGER, 5));

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(navigate).toHaveBeenCalledWith({ to: '/projects' });
  });
});
