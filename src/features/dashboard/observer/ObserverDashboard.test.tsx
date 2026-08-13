import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ObserverDashboard } from '@/features/dashboard/observer/ObserverDashboard';
import { ROLES, type Project, type User, type WorkflowStep } from '@/lib/types';
import { useAppStore } from '@/store/store';

import type * as ReactRouter from '@tanstack/react-router';

/* ---------- hoisted mocks ---------- */

const { mockNavigate, mockUseUserProjects } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseUserProjects: vi.fn(),
}));

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof ReactRouter>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/features/projects/hooks/useProjects', () => ({
  useUserProjects: () => mockUseUserProjects() as unknown,
}));

/* ---------- factories ---------- */

const workflowConfig: WorkflowStep[] = [
  { id: 'not_started', label: 'Not Started' },
  { id: 'draft', label: 'Drafting' },
  { id: 'complete', label: 'Complete' },
];

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 1,
  name: 'Test Project',
  sourceName: 'IRV Gujarati',
  organization: 1,
  status: 'active',
  createdBy: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  metadata: {},
  sourceLanguageName: 'Gujarati',
  targetLanguageName: 'Kachi Koli',
  lastChapterActivity: '2026-01-01T00:00:00.000Z',
  chapterStatusCounts: { not_started: 5, draft: 3, complete: 2 },
  workflowConfig,
  ...overrides,
});

/* ---------- tests ---------- */

describe('ObserverDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      userdetail: {
        id: 42,
        email: 'observer@example.com',
        username: 'observer',
        role: ROLES.PROJECT_OBSERVER,
        grants: [
          {
            orgId: 1,
            roleId: ROLES.PROJECT_OBSERVER,
            roleName: 'Project Observer',
            permissions: [],
          },
        ],
        lastActiveOrgId: 1,
      } as unknown as User,
    });
  });

  it('renders the "Observer Dashboard" heading', () => {
    mockUseUserProjects.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<ObserverDashboard />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Observer Dashboard');
  });

  it('shows loading spinner while projects are being fetched', () => {
    mockUseUserProjects.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(<ObserverDashboard />);

    expect(screen.getByText('Loading projects…')).toBeInTheDocument();
  });

  it('shows empty state when no projects', () => {
    mockUseUserProjects.mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<ObserverDashboard />);

    expect(screen.getByText('You have not been added to any projects yet.')).toBeInTheDocument();
  });

  it('renders project rows with correct columns', () => {
    const project = makeProject();
    mockUseUserProjects.mockReturnValue({ data: [project], isLoading: false, isError: false });

    render(<ObserverDashboard />);

    // Title
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    // Source Bible and Language (combined)
    expect(screen.getByText('IRV Gujarati (Gujarati)')).toBeInTheDocument();
    // Target Language
    expect(screen.getByText('Kachi Koli')).toBeInTheDocument();
  });

  it('navigates to project detail on row click', async () => {
    const project = makeProject({ id: 99 });
    mockUseUserProjects.mockReturnValue({ data: [project], isLoading: false, isError: false });

    const user = userEvent.setup();
    render(<ObserverDashboard />);

    await user.click(screen.getByText('Test Project'));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/projects/$projectId',
      params: { projectId: '99' },
      state: { from: '/' },
    });
  });

  it('navigates to project detail on keyboard activation (Enter and Space)', async () => {
    const project = makeProject({ id: 99 });
    mockUseUserProjects.mockReturnValue({
      data: [project],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    render(<ObserverDashboard />);

    const projectRow = screen.getByRole('button', { name: `Open project ${project.name}` });
    projectRow.focus();
    expect(projectRow).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(mockNavigate).toHaveBeenLastCalledWith({
      to: '/projects/$projectId',
      params: { projectId: '99' },
      state: { from: '/' },
    });

    await user.keyboard(' ');
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });

  it('renders error state when query fails and allows retry', async () => {
    const mockRefetch = vi.fn();
    mockUseUserProjects.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });

    const user = userEvent.setup();
    render(<ObserverDashboard />);

    expect(screen.getByText('Failed to load projects.')).toBeInTheDocument();
    expect(
      screen.queryByText('You have not been added to any projects yet.')
    ).not.toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    await user.click(retryButton);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('does not render Create Project button or filter dropdowns', () => {
    mockUseUserProjects.mockReturnValue({
      data: [makeProject()],
      isLoading: false,
      isError: false,
    });

    render(<ObserverDashboard />);

    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    expect(screen.queryByText('Show All')).not.toBeInTheDocument();
  });
});
