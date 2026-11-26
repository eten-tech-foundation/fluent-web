import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { ROLES, type Project, type User, type UserDetail } from '@/lib/types';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, within } from '@/test/render';

import { OrganizationDetailWrapper } from './OrganizationDetailWrapper';

const { state, navigate } = vi.hoisted(() => ({
  state: {
    search: {} as { modal?: string; tab?: string },
    userdetail: null as UserDetail | null,
  },
  navigate: vi.fn(),
}));

// Labels come from the shipped English locale (with its plurals), so the tests read what users see.
vi.mock('react-i18next', async () => {
  const { default: enCommon } = await import('../../../../public/locales/en/common.json');
  const messages: Record<string, unknown> = enCommon;
  const interpolate = (text: string, options?: Record<string, unknown>) =>
    text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options?.[name] ?? ''));
  return {
    useTranslation: () => ({
      t: (key: string, options?: string | Record<string, unknown>) => {
        const values = typeof options === 'object' ? options : undefined;
        const count = values?.count;
        const plural =
          typeof count === 'number'
            ? messages[`${key}_${count === 1 ? 'one' : 'other'}`]
            : undefined;
        const message = plural ?? messages[key];
        if (typeof message === 'string') return interpolate(message, values);
        return typeof options === 'string' ? options : key;
      },
    }),
  };
});
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ orgId: '3' }),
    useSearch: () => state.search,
  }),
  useNavigate: () => navigate,
}));
vi.mock('@/store/store', () => ({
  useAppStore: () => ({ userdetail: state.userdetail }),
}));

const superAdmin: UserDetail = {
  id: 1,
  username: 'superadmin',
  email: 'sa@example.com',
  activeRoleName: null,
  lastActiveOrgId: null,
  grants: [
    { orgId: null, projectId: null, roleId: 1, roleName: ROLES.SUPER_ADMIN, permissions: [] },
  ],
};
state.userdetail = superAdmin;

const member = (id: number, username: string, roleName: string): User => ({
  id,
  username,
  email: `${username.toLowerCase().replace(/\s+/g, '.')}@example.com`,
  status: 'verified',
  orgGrants: [{ orgId: 3, projectId: null, roleId: 2, roleName, permissions: [] }],
});

const project = (id: number, name: string, organization: number): Project => ({
  id,
  name,
  organization,
  sourceName: 'IRV Gujarati',
  status: 'active',
  createdBy: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  metadata: {},
  sourceLanguageName: 'Gujarati',
  targetLanguageName: `${name} language`,
  lastChapterActivity: '2026-11-20T00:00:00.000Z',
  chapterStatusCounts: {},
  workflowConfig: [],
  milestoneCount: id === 13 ? 2 : 1,
});

/** Serves org 3 "BCS" with four members; `projects` is GET /projects, or 'error' for a 500. */
const serve = (projects: Project[] | 'error') => {
  server.use(
    http.get(`${config.api.url}/organizations/3`, () =>
      HttpResponse.json({ id: 3, name: 'BCS', createdAt: null, orgManagerCount: 1 })
    ),
    http.get(`${config.api.url}/organizations/3/users`, () =>
      HttpResponse.json([
        member(21, 'Chad W', ROLES.ORG_MANAGER),
        member(22, 'Diana Chen', ROLES.PROJECT_MANAGER),
        member(23, 'qa.manager', ROLES.PROJECT_MANAGER),
        member(24, 'Samuel Park', ROLES.PROJECT_MANAGER),
      ])
    ),
    http.get(`${config.api.url}/projects`, () =>
      projects === 'error'
        ? HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
        : HttpResponse.json(projects)
    )
  );
};

// Org 3 holds three projects; GET /projects also returns org 4's, as it does for a Super Admin.
const bcsProjects = [
  project(13, 'Varli NT', 3),
  project(11, 'Kachi Koli NT', 3),
  project(40, 'Other org project', 4),
  project(12, 'Kukna NT', 3),
];

const renderPage = (search: { tab?: string } = {}) => {
  state.search = search;
  return renderWithProviders(<OrganizationDetailWrapper />);
};

describe('OrganizationDetailWrapper (#566)', () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it('opens on the Members tab, with Invite Org Manager next to the Members heading', async () => {
    serve(bcsProjects);
    renderPage();

    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Projects' })).toHaveAttribute('aria-selected', 'false');
    const members = screen.getByRole('tabpanel', { name: 'Members' });
    expect(within(members).getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    expect(within(members).getByRole('button', { name: 'Invite Org Manager' })).toBeInTheDocument();
    expect(await within(members).findByText('Diana Chen')).toBeInTheDocument();
  });

  it('shows the member, Org Manager and project counts under the organization name', async () => {
    serve(bcsProjects);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'BCS' })).toBeInTheDocument();
    expect(await screen.findByText('4 members · 1 Org Manager · 3 projects')).toBeInTheDocument();
  });

  it('lists the organization projects on the Projects tab with the /projects columns, and no Create Project, sort or filter', async () => {
    serve(bcsProjects);
    renderPage({ tab: 'projects' });

    expect(screen.getByRole('tab', { name: 'Projects' })).toHaveAttribute('aria-selected', 'true');
    const projects = screen.getByRole('tabpanel', { name: 'Projects' });
    expect(within(projects).getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(await within(projects).findByText('Kukna NT')).toBeInTheDocument();
    expect(
      within(projects)
        .getAllByRole('columnheader')
        .map(h => h.textContent)
    ).toEqual([
      'Project Name',
      'Source Language',
      'Target Language',
      'Source Bible',
      'Milestones',
      'Overall Progress',
    ]);
    const rows = within(projects).getAllByRole('row').slice(1);
    expect(rows.map(row => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      'Kachi Koli NT',
      'Kukna NT',
      'Varli NT',
    ]);
    expect(
      within(rows[2])
        .getAllByRole('cell')
        .map(cell => cell.textContent)
    ).toEqual(['Varli NT', 'Gujarati', 'Varli NT language', 'IRV Gujarati', '2', '']);
    expect(screen.queryByRole('button', { name: /create project/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('says so when the organization has no projects yet', async () => {
    serve([project(40, 'Other org project', 4)]);
    renderPage({ tab: 'projects' });

    const projects = screen.getByRole('tabpanel', { name: 'Projects' });
    expect(
      await within(projects).findByText('No projects in this organization yet.')
    ).toBeInTheDocument();
    expect(within(projects).queryByRole('table')).not.toBeInTheDocument();
    expect(await screen.findByText('4 members · 1 Org Manager · 0 projects')).toBeInTheDocument();
  });

  it('says the projects failed to load, rather than showing none', async () => {
    serve('error');
    renderPage({ tab: 'projects' });

    const projects = screen.getByRole('tabpanel', { name: 'Projects' });
    expect(await within(projects).findByText('Failed to load projects.')).toBeInTheDocument();
    expect(within(projects).queryByText('No projects in this organization yet.')).toBeNull();
    // The counts leave the project count out instead of claiming 0.
    expect(await screen.findByText('4 members · 1 Org Manager')).toBeInTheDocument();
  });

  it('opens the project when its row is selected', async () => {
    serve(bcsProjects);
    const { user } = renderPage({ tab: 'projects' });

    await user.click(await screen.findByText('Kukna NT'));

    expect(navigate).toHaveBeenCalledWith({
      to: '/projects/$projectId',
      params: { projectId: '12' },
    });
  });

  it('puts the Projects tab in the URL when it is selected', async () => {
    serve(bcsProjects);
    const { user } = renderPage();

    await user.click(screen.getByRole('tab', { name: 'Projects' }));

    expect(navigate).toHaveBeenCalledWith({
      to: '/organizations/$orgId',
      params: { orgId: '3' },
      search: { tab: 'projects' },
      replace: true,
    });
  });

  it('goes back to the Members tab without a tab in the URL', async () => {
    serve(bcsProjects);
    const { user } = renderPage({ tab: 'projects' });

    await user.click(screen.getByRole('tab', { name: 'Members' }));

    expect(navigate).toHaveBeenCalledWith({
      to: '/organizations/$orgId',
      params: { orgId: '3' },
      search: {},
      replace: true,
    });
  });
});
