import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserHomePage } from '@/features/dashboard/user/UserHomePage';
import { config } from '@/lib/config';
import { type User, type UserChapterAssignment } from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { renderWithProviders as render } from '@/test/render';

import type * as ReactRouter from '@tanstack/react-router';

const { mockNavigate, mockUseSearch, mockUseChapterAssignments } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseSearch: vi.fn(() => ({}) as { tab?: 'my-work' | 'my-history' }),
  mockUseChapterAssignments: vi.fn(),
}));

// Decouple from the real router so UserHomePage renders without a RouterProvider.
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof ReactRouter>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearch: () => mockUseSearch(),
  };
});

vi.mock('@/hooks/useChapterAssignment', () => ({
  useChapterAssignmentsByUserId: () => mockUseChapterAssignments() as unknown,
}));

const assignment = (overrides: Partial<UserChapterAssignment>): UserChapterAssignment => ({
  chapterAssignmentId: 1,
  projectId: 1,
  projectName: 'Project A',
  projectUnitId: 10,
  bibleId: 1,
  bibleName: 'Test Bible',
  chapterStatus: 'draft',
  targetLanguage: 'Spanish',
  targetLangCode: 'spa',
  sourceLangCode: 'eng',
  bookCode: 'GEN',
  bookId: 1,
  book: 'Genesis',
  chapterNumber: 1,
  totalVerses: 31,
  completedVerses: 3,
  submittedTime: null,
  ...overrides,
});

// One in-progress chapter (My Work) and one submitted chapter (My History).
const workChapter = assignment({ book: 'Genesis' });
const historyChapter = assignment({
  chapterAssignmentId: 2,
  book: 'Exodus',
  bookId: 2,
  chapterStatus: 'complete',
  completedVerses: 31,
  submittedTime: '2026-06-01T00:00:00.000Z',
});

describe('UserHomePage tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ userdetail: { id: 7, role: 'some-role-name' } as unknown as User });
    mockUseSearch.mockReturnValue({});
    mockUseChapterAssignments.mockReturnValue({
      data: { assignedChapters: [workChapter, historyChapter], peerCheckChapters: [] },
      isLoading: false,
    });
  });

  it('shows the My Work tab when no tab is present in the URL', () => {
    render(<UserHomePage />);

    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('Genesis')).toBeInTheDocument();
    expect(screen.queryByText('Exodus')).not.toBeInTheDocument();
  });

  it('shows the My History tab when the URL has ?tab=my-history', () => {
    mockUseSearch.mockReturnValue({ tab: 'my-history' });

    render(<UserHomePage />);

    expect(screen.getByText('Submitted Date')).toBeInTheDocument();
    expect(screen.getByText('Exodus')).toBeInTheDocument();
    expect(screen.queryByText('Genesis')).not.toBeInTheDocument();
  });

  it('navigates with the tab search param when My History is clicked', async () => {
    const user = userEvent.setup();
    render(<UserHomePage />);

    await user.click(screen.getByRole('button', { name: /my history/i }));

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/', search: { tab: 'my-history' } });
  });

  it('navigates back to a clean URL when My Work is clicked', async () => {
    mockUseSearch.mockReturnValue({ tab: 'my-history' });
    const user = userEvent.setup();
    render(<UserHomePage />);

    await user.click(screen.getByRole('button', { name: /my work/i }));

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/', search: {} });
  });

  it('includes custom stages in the status filter dropdown', async () => {
    const user = userEvent.setup();
    const customChapter = assignment({
      chapterAssignmentId: 3,
      book: 'Leviticus',
      bookId: 3,
      chapterStatus: 'custom_audio_check',
    });
    mockUseChapterAssignments.mockReturnValue({
      data: {
        assignedChapters: [workChapter, customChapter],
        peerCheckChapters: [],
      },
      isLoading: false,
    });

    render(<UserHomePage />);

    const statusFilterBtn = screen.getByRole('button', { name: /status/i });
    await user.click(statusFilterBtn);

    const popover = screen.getByRole('dialog');
    expect(within(popover).getByText('custom_audio_check')).toBeInTheDocument();
  });

  it('lists both Draft and Drafting when two different projects have different display names for draft', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${config.api.url}/projects/1/workflow-stages`, () =>
        HttpResponse.json([
          { id: 'not_started', label: 'Not Started', stageId: 1, position: 0 },
          { id: 'draft', label: 'Draft', stageId: 2, position: 1 },
          { id: 'complete', label: 'Complete', stageId: 3, position: 2 },
        ])
      ),
      http.get(`${config.api.url}/projects/2/workflow-stages`, () =>
        HttpResponse.json([
          { id: 'not_started', label: 'Not Started', stageId: 1, position: 0 },
          { id: 'draft', label: 'Drafting', stageId: 2, position: 1 },
          { id: 'complete', label: 'Complete', stageId: 3, position: 2 },
        ])
      )
    );

    const project1Chapter = assignment({
      chapterAssignmentId: 1,
      projectId: 1,
      book: 'Genesis',
      chapterStatus: 'draft',
    });
    const project2Chapter = assignment({
      chapterAssignmentId: 2,
      projectId: 2,
      projectUnitId: 20,
      bookId: 2,
      book: 'Exodus',
      chapterStatus: 'draft',
    });

    mockUseChapterAssignments.mockReturnValue({
      data: {
        assignedChapters: [project1Chapter, project2Chapter],
        peerCheckChapters: [],
      },
      isLoading: false,
    });

    render(<UserHomePage />);

    const statusFilterBtn = screen.getByRole('button', { name: /status/i });
    await user.click(statusFilterBtn);

    const popover = screen.getByRole('dialog');
    expect(await within(popover).findByText('Draft')).toBeInTheDocument();
    expect(await within(popover).findByText('Drafting')).toBeInTheDocument();
  });
});
