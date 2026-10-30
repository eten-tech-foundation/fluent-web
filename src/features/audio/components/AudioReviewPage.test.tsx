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

let currentRecordings = [...mockRecordings];
let currentPericopes: PericopeGroup[] = mockPericopes;

vi.mock('@/features/audio/hooks/useChapterAudio', () => ({
  useChapterAudio: () => ({
    data: { items: currentRecordings, total: currentRecordings.length },
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
    data: currentPericopes,
  }),
}));

const mockResolveMutate = vi.fn();

vi.mock('@/features/audio/hooks/useResolveConflict', () => ({
  useResolveConflict: () => ({
    mutate: mockResolveMutate,
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
    currentRecordings = [...mockRecordings];
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

  it('switches to verse view locally when clicking page-specified switch button in conflict banner, keeping global setting unchanged', () => {
    currentRecordings = [
      {
        ...mockRecordings[0],
        conflictStatus: 'conflict',
      },
      mockRecordings[1],
      mockRecordings[2],
    ];
    useAppStore.setState({ displayMode: 'pericope' });
    const { unmount } = renderPage();

    expect(screen.getByText('Verses 1–2')).toBeInTheDocument();

    // Click page-specified "Switch to Verse view" in the conflict banner
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

  it('selects the conflicted verse when switching to verse view from a pericope with conflict on a later verse', () => {
    currentRecordings = [
      mockRecordings[0],
      {
        ...mockRecordings[1], // verse 2 has the conflict
        conflictStatus: 'conflict',
      },
      mockRecordings[2],
    ];
    useAppStore.setState({ displayMode: 'pericope' });
    renderPage();

    const switchButton = screen.getByRole('button', { name: /switch to verse view/i });
    fireEvent.click(switchButton);

    // Selected passage in verse view should be Verse 2, showing its conflicting takes header
    expect(
      screen.getByRole('heading', { level: 2, name: /conflicting takes/i })
    ).toBeInTheDocument();
    // Verse 2 list item should be selected (has bg-accent class)
    const verse2Button = screen.getByRole('button', { name: /verse 2/i });
    expect(verse2Button).toHaveClass('bg-accent');
  });
});

describe('AudioReviewPage pericope stitched audio & cross-view conflicts (Issue #554)', () => {
  beforeEach(() => {
    currentRecordings = [...mockRecordings];
    currentPericopes = mockPericopes;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    useAppStore.setState({
      displayMode: 'pericope',
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
            roleName: 'Project Manager',
            permissions: [],
          },
        ],
        lastActiveOrgId: 1,
      },
    });
  });

  it('renders stitched audio player and correct subtitle for verse-recorded pericopes without conflicts', () => {
    renderPage();

    // Subtitle under Recorded Takes
    expect(screen.getByText('Recorded by verse. Played as one recording.')).toBeInTheDocument();

    // Stitched card with heading
    expect(screen.getByTestId('stitched-audio-card')).toBeInTheDocument();
    expect(screen.getByText('Stitched from verse recordings, vv. 1-2')).toBeInTheDocument();

    // No individual TakeCard elements rendered
    expect(screen.queryByText(/Take 1/)).not.toBeInTheDocument();
  });

  it('shows skipped verse notes when a verse has conflict in pericope view', () => {
    currentRecordings = [
      mockRecordings[0], // verse 1 clean
      {
        ...mockRecordings[1],
        conflictStatus: 'conflict', // verse 2 conflict
      },
      mockRecordings[2],
    ];

    renderPage();

    expect(screen.getByTestId('stitched-audio-card')).toBeInTheDocument();
    expect(screen.getByText('Verse 2 not included: conflict')).toBeInTheDocument();
  });

  it('shows skipped verse notes when a verse is unrecorded in pericope view', () => {
    // Only verse 1 is recorded in pericope 1-2, verse 2 is missing
    currentRecordings = [
      mockRecordings[0],
      mockRecordings[2], // verse 3
    ];

    renderPage();

    expect(screen.getByTestId('stitched-audio-card')).toBeInTheDocument();
    expect(screen.getByText('Verse 2 not included: no recording')).toBeInTheDocument();
  });

  it('displays cross-view warning indicator and banner in pericope view when verse has conflict', () => {
    currentRecordings = [
      {
        ...mockRecordings[0],
        conflictStatus: 'conflict',
      },
      mockRecordings[1],
      mockRecordings[2],
    ];

    renderPage();

    // Left column warning indicator
    expect(screen.getByText('Conflict in verse 1')).toBeInTheDocument();

    // Center column conflict banner
    expect(screen.getByText(/This conflict was recorded by verse\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to verse view/i })).toBeInTheDocument();

    // In opposing mode, no "Select as Draft" button is rendered
    expect(screen.queryByText(/Select as Draft/i)).not.toBeInTheDocument();
  });

  it('displays cross-view warning indicator and banner in verse view when pericope has conflict', () => {
    useAppStore.setState({ displayMode: 'verse' });

    // Pericope covering verses 1-2 is in conflict
    currentRecordings = [
      {
        id: 99,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 10,
        versionToken: 1,
        downloadUrl: 'https://example.com/p.webm',
        verseNumber: 1,
        isPericope: true,
        pericopeRange: [1, 2],
        conflictStatus: 'conflict',
        activeTakeId: 991,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 991,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 10,
            contentHash: 'hash-991',
            downloadUrl: 'https://example.com/991.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
      mockRecordings[2], // verse 3
    ];

    renderPage();

    // Left column warning indicator on verse 1 and verse 2
    expect(screen.getAllByText('Conflict in pericope vv. 1-2')).toHaveLength(2);

    // Center column banner
    expect(screen.getByText(/This conflict was recorded as a pericope\./)).toBeInTheDocument();
    const switchBtn = screen.getByRole('button', { name: /switch to pericope view/i });
    expect(switchBtn).toBeInTheDocument();

    // Conflicting pericope takes are suppressed in verse view
    expect(screen.queryByText(/Take.*Pericope/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Select as Draft/i)).not.toBeInTheDocument();

    // Clicking switch to pericope switches local view
    fireEvent.click(switchBtn);
    expect(screen.getByText('Verses 1–2')).toBeInTheDocument();
  });

  it('renders pericope takes under covered verses in verse view when pericope is clean', () => {
    useAppStore.setState({ displayMode: 'verse' });

    currentRecordings = [
      mockRecordings[0], // verse 1 has its own verse recording
      {
        id: 99,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 10,
        versionToken: 1,
        downloadUrl: 'https://example.com/p.webm',
        verseNumber: 1,
        isPericope: true,
        pericopeRange: [1, 2],
        conflictStatus: 'clean',
        activeTakeId: 991,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 991,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 10,
            contentHash: 'hash-991',
            downloadUrl: 'https://example.com/991.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    // Should display verse 1 take and pericope take labeled "Take 1 - Pericope - vv. 1-2"
    expect(screen.getByText('Take 1 - Pericope - vv. 1-2')).toBeInTheDocument();
  });

  it('renders pericope takes under covered verses in chapter view when pericope is clean', () => {
    useAppStore.setState({ displayMode: 'chapter' });

    currentRecordings = [
      mockRecordings[0],
      {
        id: 99,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 10,
        versionToken: 1,
        downloadUrl: 'https://example.com/p.webm',
        verseNumber: 1,
        isPericope: true,
        pericopeRange: [1, 2],
        conflictStatus: 'clean',
        activeTakeId: 991,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 991,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 10,
            contentHash: 'hash-991',
            downloadUrl: 'https://example.com/991.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    expect(screen.getByText('Take 1 - Pericope - vv. 1-2')).toBeInTheDocument();
  });

  it('excludes covering pericope takes from Select as Draft when verse is in conflict', () => {
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
            roleName: 'Project Manager',
            permissions: [],
          },
        ],
        lastActiveOrgId: 1,
      },
    });

    currentRecordings = [
      {
        ...mockRecordings[0],
        conflictStatus: 'conflict',
        activeTakeId: 11,
        takes: [
          mockRecordings[0].takes[0],
          {
            id: 112,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 5,
            contentHash: 'hash-112',
            downloadUrl: 'https://example.com/112.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      },
      {
        id: 99,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 10,
        versionToken: 1,
        downloadUrl: 'https://example.com/p.webm',
        verseNumber: 1,
        isPericope: true,
        pericopeRange: [1, 2],
        conflictStatus: 'clean',
        activeTakeId: 991,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 991,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 10,
            contentHash: 'hash-991',
            downloadUrl: 'https://example.com/991.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    // Select as Draft button should appear for both takes belonging to verse recording (11 and 112),
    // and NOT for covering pericope take 991.
    const selectButtons = screen.getAllByRole('button', { name: /select as draft/i });
    expect(selectButtons).toHaveLength(2);
  });

  it('allows selecting the current active draft take to resolve a conflict', () => {
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
            roleName: 'Project Manager',
            permissions: [],
          },
        ],
        lastActiveOrgId: 1,
      },
    });

    currentRecordings = [
      {
        ...mockRecordings[0],
        conflictStatus: 'conflict',
        activeTakeId: 11,
        takes: [
          mockRecordings[0].takes[0],
          {
            id: 112,
            uploadedBy: 2,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 5,
            contentHash: 'hash-112',
            downloadUrl: 'https://example.com/112.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      },
    ];

    renderPage();

    // Verify "Current Draft" indicator is visible
    expect(screen.getByText('Current Draft')).toBeInTheDocument();

    // Both takes have "Select as Draft" buttons
    const selectButtons = screen.getAllByRole('button', { name: /select as draft/i });
    expect(selectButtons).toHaveLength(2);

    // Clicking "Select as Draft" on Take 1 (which is the current draft, take 11) calls mutate
    fireEvent.click(selectButtons[0]);
    expect(mockResolveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        takeId: 11,
      }),
      expect.anything()
    );
  });

  it('renders without crashing when there are no recordings or passages', () => {
    currentRecordings = [];
    renderPage();
    expect(screen.getByText('No recorded takes found for this chapter.')).toBeInTheDocument();
  });

  it('displays both conflict dot and cross-view warning indicator in pericope view when both direct and verse conflicts exist', () => {
    // Both direct pericope conflict and verse 1 conflict
    currentRecordings = [
      {
        ...mockRecordings[0],
        conflictStatus: 'conflict',
      },
      mockRecordings[1],
      mockRecordings[2],
      {
        id: 99,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 10,
        versionToken: 1,
        downloadUrl: 'https://example.com/p.webm',
        verseNumber: 1,
        isPericope: true,
        pericopeRange: [1, 2],
        conflictStatus: 'conflict',
        activeTakeId: 991,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 991,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 10,
            contentHash: 'hash-991',
            downloadUrl: 'https://example.com/991.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
          {
            id: 992,
            uploadedBy: 2,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 10,
            contentHash: 'hash-992',
            downloadUrl: 'https://example.com/992.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    // Cross-view indicator is present on the row
    expect(screen.getByText('Conflict in verse 1')).toBeInTheDocument();

    // Direct conflict banner and cross-view notice are present
    expect(
      screen.getByText('This passage has conflicting takes — select one to resolve.')
    ).toBeInTheDocument();
    expect(screen.getByText(/There is also a conflict recorded by verse\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to verse view/i })).toBeInTheDocument();

    // Direct pericope takes can still be resolved as draft
    expect(screen.getAllByRole('button', { name: /select as draft/i })[0]).toBeInTheDocument();
  });

  it('displays both conflict dot and cross-view warning indicator in verse view when both verse direct conflict and covering pericope conflict exist', () => {
    useAppStore.setState({ displayMode: 'verse' });

    currentRecordings = [
      {
        ...mockRecordings[0],
        conflictStatus: 'conflict',
        takes: [
          mockRecordings[0].takes[0],
          {
            id: 113,
            uploadedBy: 2,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 10,
            contentHash: 'hash-113',
            downloadUrl: 'https://example.com/113.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      },
      mockRecordings[1],
      mockRecordings[2],
      {
        id: 99,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 10,
        versionToken: 1,
        downloadUrl: 'https://example.com/p.webm',
        verseNumber: 1,
        isPericope: true,
        pericopeRange: [1, 2],
        conflictStatus: 'conflict',
        activeTakeId: 991,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 991,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 10,
            contentHash: 'hash-991',
            downloadUrl: 'https://example.com/991.webm',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    // Cross-view indicator is present on verse 1 row (and verse 2 row covered by pericope 1-2)
    expect(screen.getAllByText('Conflict in pericope vv. 1-2')[0]).toBeInTheDocument();

    // Direct conflict banner and cross-view notice are present
    expect(
      screen.getByText('This passage has conflicting takes — select one to resolve.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/There is also a conflict recorded as a pericope\./)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to pericope view/i })).toBeInTheDocument();

    // Direct verse takes can still be resolved as draft
    expect(screen.getAllByRole('button', { name: /select as draft/i })[0]).toBeInTheDocument();
  });

  it('honestly labels cross-chapter pericopes showing continuation in the next chapter', () => {
    currentPericopes = [
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        verses: [
          { verseNumber: 1, chapterNumber: 6 },
          { verseNumber: 2, chapterNumber: 6 },
          { verseNumber: 1, chapterNumber: 7 },
        ],
      },
    ];

    renderPage();

    // The passage in the list should note continuation in ch. 7
    expect(screen.getByText('Verses 1–2 (cont. in ch. 7)')).toBeInTheDocument();

    // The StitchedAudioPlayer title should also note continuation
    expect(
      screen.getByText('Stitched from verse recordings, vv. 1-2 (cont. in ch. 7)')
    ).toBeInTheDocument();
  });

  it('displays active pericope take on all covered verses when switching from pericope to verse view (backend contract)', () => {
    useAppStore.setState({ displayMode: 'pericope' });

    currentRecordings = [
      {
        id: 100,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 15,
        versionToken: 1,
        downloadUrl: 'https://example.com/p100.webm',
        verseNumber: 1,
        granularity: 'pericope',
        startChapter: 6,
        startVerse: 1,
        endChapter: 6,
        endVerse: 2,
        conflictStatus: 'clean',
        activeTakeId: 1001,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 1001,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 15,
            contentHash: 'hash-1001',
            downloadUrl: 'https://example.com/1001.webm',
            granularity: 'pericope',
            startChapter: 6,
            startVerse: 1,
            endChapter: 6,
            endVerse: 2,
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    // In pericope view: since pericope recording exists, takes list is rendered with the pericope take
    expect(screen.getByText('Take 1')).toBeInTheDocument();

    // Now switch to verse view
    act(() => {
      useAppStore.setState({ displayMode: 'verse' });
    });

    // Both verse 1 and verse 2 buttons exist in the list
    expect(screen.getByRole('button', { name: /verse 1/i })).toBeInTheDocument();
    const verse2Btn = screen.getByRole('button', { name: /verse 2/i });
    expect(verse2Btn).toBeInTheDocument();

    // On verse 1: active pericope take is shown
    expect(screen.getByText('Take 1 - Pericope - vv. 1-2')).toBeInTheDocument();

    // Click verse 2: active pericope take is also shown on verse 2
    fireEvent.click(verse2Btn);
    expect(screen.getByText('Take 1 - Pericope - vv. 1-2')).toBeInTheDocument();
  });

  it('does not show covering pericope take under verse when activeTakeId is null, while preserving access in pericope view', () => {
    useAppStore.setState({ displayMode: 'verse' });

    currentRecordings = [
      {
        id: 100,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 15,
        versionToken: 1,
        downloadUrl: 'https://example.com/p100.webm',
        verseNumber: 1,
        granularity: 'pericope',
        startChapter: 6,
        startVerse: 1,
        endChapter: 6,
        endVerse: 2,
        conflictStatus: 'clean',
        activeTakeId: null, // No active take
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 1001,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 15,
            contentHash: 'hash-1001',
            downloadUrl: 'https://example.com/1001.webm',
            granularity: 'pericope',
            startChapter: 6,
            startVerse: 1,
            endChapter: 6,
            endVerse: 2,
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    // In verse view: since activeTakeId is null, no covering pericope take should be shown
    expect(screen.queryByText(/Take 1 - Pericope/i)).not.toBeInTheDocument();

    // Switch to pericope view: access to all takes is preserved
    act(() => {
      useAppStore.setState({ displayMode: 'pericope' });
    });
    expect(screen.getByText('Take 1')).toBeInTheDocument();
  });

  it('matches cross-chapter pericope when range fields exist only on a take', () => {
    useAppStore.setState({ displayMode: 'pericope' });

    currentPericopes = [
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        verses: [
          { verseNumber: 1, chapterNumber: 6 },
          { verseNumber: 2, chapterNumber: 6 },
          { verseNumber: 1, chapterNumber: 7 },
          { verseNumber: 2, chapterNumber: 7 },
        ],
      },
    ];

    currentRecordings = [
      {
        id: 200,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 15,
        versionToken: 1,
        downloadUrl: 'https://example.com/p200.webm',
        verseNumber: 1,
        granularity: 'pericope',
        conflictStatus: 'clean',
        activeTakeId: 2001,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 2001,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 15,
            contentHash: 'hash-2001',
            downloadUrl: 'https://example.com/2001.webm',
            granularity: 'pericope',
            // Range fields exist ONLY on the take, matching cross-chapter pericope (ch 6 v 1 to ch 7 v 2)
            startChapter: 6,
            startVerse: 1,
            endChapter: 7,
            endVerse: 2,
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    // The cross-chapter pericope matches and displays the pericope take
    expect(screen.getByText('Take 1')).toBeInTheDocument();
  });

  it('handles cross-chapter pericope in verse view (shows covered verses, lists active take, shows conflict indicator)', () => {
    useAppStore.setState({ displayMode: 'verse' });

    currentPericopes = [
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        verses: [
          { verseNumber: 1, chapterNumber: 6 },
          { verseNumber: 2, chapterNumber: 6 },
          { verseNumber: 1, chapterNumber: 7 },
        ],
      },
    ];

    // No direct verse recordings, only a cross-chapter pericope recording (clean with active take)
    currentRecordings = [
      {
        id: 300,
        projectUnitId: 1,
        bibleTextId: 1,
        uploadedBy: 1,
        contentType: 'audio/webm',
        sizeBytes: 1000,
        durationSeconds: 15,
        versionToken: 1,
        downloadUrl: 'https://example.com/p300.webm',
        verseNumber: 1,
        granularity: 'pericope',
        conflictStatus: 'clean',
        activeTakeId: 3001,
        startChapter: 6,
        startVerse: 1,
        endChapter: 7,
        endVerse: 1,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        takes: [
          {
            id: 3001,
            uploadedBy: 1,
            contentType: 'audio/webm',
            sizeBytes: 1000,
            durationSeconds: 15,
            contentHash: 'hash-3001',
            downloadUrl: 'https://example.com/3001.webm',
            granularity: 'pericope',
            startChapter: 6,
            startVerse: 1,
            endChapter: 7,
            endVerse: 1,
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    // 1. Covered verse rows in chapter 6 (Verse 1 and Verse 2) are present
    expect(screen.getByRole('button', { name: /Verse 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verse 2/i })).toBeInTheDocument();

    // 2. Active take is listed under the covered verse with cross-chapter label
    expect(screen.getByText(/Take 1 - Pericope - vv\. ch\. 6:1–ch\. 7:1/i)).toBeInTheDocument();

    // 3. When in conflict, conflict indicator and message are displayed
    currentRecordings = [
      {
        ...currentRecordings[0],
        conflictStatus: 'conflict',
      } as unknown as VerseAudioRecording,
    ];

    renderPage();

    expect(screen.getAllByText('Conflict in pericope vv. ch. 6:1–ch. 7:1').length).toBeGreaterThan(
      0
    );
  });
});
