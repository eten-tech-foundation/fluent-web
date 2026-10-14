import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackRegistryProvider } from '@/features/tts';
import { type PericopeGroup, type ProjectItem, type VerseAudioRecording } from '@/lib/types';
import { useAppStore } from '@/store/store';

import AudioReviewPage from './AudioReviewPage';

vi.mock('react-i18next', () => import('@/test/i18n'));

const mockRouter = {
  history: {
    back: vi.fn(),
  },
};

const mockProjectItem = {
  chapterAssignmentId: 101,
  projectId: 1,
  projectName: 'Test Project',
  bookId: 1,
  bookCode: 'GEN',
  book: 'Genesis',
  chapterNumber: 6,
  projectUnitId: 1,
} as unknown as ProjectItem;

const mockRecordings = [
  {
    id: 1,
    projectUnitId: 1,
    bibleTextId: 1,
    uploadedBy: 1,
    contentType: 'audio/webm',
    sizeBytes: 1000,
    durationSeconds: 5,
    versionToken: 1,
    downloadUrl: 'https://example.com/1.webm',
    verseNumber: 1,
    conflictStatus: 'clean',
    activeTakeId: 11,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    takes: [
      {
        id: 11,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 5,
        contentHash: 'hash-11',
        downloadUrl: 'https://example.com/11.webm',
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
      },
    ],
  },
  {
    id: 2,
    projectUnitId: 1,
    bibleTextId: 2,
    uploadedBy: 1,
    contentType: 'audio/webm',
    sizeBytes: 1000,
    durationSeconds: 5,
    versionToken: 1,
    downloadUrl: 'https://example.com/2.webm',
    verseNumber: 2,
    conflictStatus: 'clean',
    activeTakeId: 12,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    takes: [
      {
        id: 12,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 5,
        contentHash: 'hash-12',
        downloadUrl: 'https://example.com/12.webm',
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
      },
    ],
  },
  {
    id: 3,
    projectUnitId: 1,
    bibleTextId: 3,
    uploadedBy: 1,
    contentType: 'audio/webm',
    sizeBytes: 1000,
    durationSeconds: 5,
    versionToken: 1,
    downloadUrl: 'https://example.com/3.webm',
    verseNumber: 3,
    conflictStatus: 'clean',
    activeTakeId: 13,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    takes: [
      {
        id: 13,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 5,
        contentHash: 'hash-13',
        downloadUrl: 'https://example.com/13.webm',
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
      },
    ],
  },
] as unknown as VerseAudioRecording[];

const mockPericopes: PericopeGroup[] = [
  {
    pericopeNumber: '1',
    pericopeTitle: null,
    verses: [
      { verseNumber: 1, chapterNumber: 6 },
      { verseNumber: 2, chapterNumber: 6 },
    ],
  },
  {
    pericopeNumber: '2',
    pericopeTitle: null,
    verses: [{ verseNumber: 3, chapterNumber: 6 }],
  },
];

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({ projectItem: mockProjectItem }),
  }),
  useRouter: () => mockRouter,
}));

vi.mock('@/features/audio/hooks/useChapterAudio', () => ({
  useChapterAudio: () => ({
    data: { items: mockRecordings, total: mockRecordings.length },
    isLoading: false,
  }),
}));

vi.mock('@/features/projects/hooks/useProjectUsers', () => ({
  useProjectUsers: () => ({
    data: [{ userId: 1, displayName: 'Alice' }],
  }),
}));

vi.mock('@/features/pericopes/hooks/useChapterPericopes', () => ({
  useChapterPericopes: () => ({
    data: mockPericopes,
  }),
}));

vi.mock('@/features/audio/hooks/useResolveConflict', () => ({
  useResolveConflict: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock('@/features/bible/hooks/useBibleTarget', () => ({
  targetTextQueryOptions: () => ({
    queryKey: ['target-text'],
    queryFn: () => [],
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlaybackRegistryProvider>
        <AudioReviewPage projectItem={mockProjectItem} />
      </PlaybackRegistryProvider>
    </QueryClientProvider>
  );
}

describe('AudioReviewPage display mode', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    useAppStore.setState({
      displayMode: 'verse',
      userdetail: {
        id: 1,
        username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        role: 'user',
        grants: [
          {
            orgId: 1,
            projectId: 1,
            roleId: 1,
            roleName: 'project_manager',
            permissions: [],
          },
        ],
        lastActiveOrgId: 1,
      },
    });
  });

  it('renders verses when global displayMode is verse', () => {
    renderPage();

    expect(screen.getByText('Verse 1')).toBeInTheDocument();
    expect(screen.getByText('Verse 2')).toBeInTheDocument();
    expect(screen.getByText('Verse 3')).toBeInTheDocument();
  });

  it('reacts immediately when displayMode is changed in the global settings to pericope', () => {
    renderPage();

    expect(screen.getByText('Verse 1')).toBeInTheDocument();

    act(() => {
      useAppStore.getState().setDisplayMode('pericope');
    });

    expect(screen.getByText('Verses 1–2')).toBeInTheDocument();
    expect(screen.getByText('Verse 3')).toBeInTheDocument();
  });

  it('switches to verse view locally when clicking page-specified switch button, keeping global setting unchanged', () => {
    useAppStore.setState({ displayMode: 'pericope' });
    const { unmount } = renderPage();

    expect(screen.getByText('Verses 1–2')).toBeInTheDocument();

    // Click page-specified "Switch to Verse view"
    const switchButton = screen.getByRole('button', { name: /switch to verse view/i });
    fireEvent.click(switchButton);

    // Page view switches to verse locally
    expect(screen.getByText('Verse 1')).toBeInTheDocument();
    expect(screen.getByText('Verse 2')).toBeInTheDocument();

    // Global store displayMode remains 'pericope' untouched
    expect(useAppStore.getState().displayMode).toBe('pericope');

    // When the user moves out and back in (remounts the page), it still respects the global setting ('pericope')
    unmount();
    renderPage();
    expect(screen.getByText('Verses 1–2')).toBeInTheDocument();
  });
});
