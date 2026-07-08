import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftingUI } from '@/features/bible/components/DraftingUI';
import {
  ChapterAssignmentStatus,
  type ProjectItem,
  type Source,
  type TargetVerse,
  type User,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

import type * as ReactRouter from '@tanstack/react-router';

// Mock TanStack Router
const { mockNavigate, mockBack } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockBack: vi.fn(),
}));

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof ReactRouter>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouter: () => ({
      history: {
        back: mockBack,
      },
    }),
  };
});

// Mock hooks
const mockUseAddTranslatedVerse = vi.fn();
const mockUseSubmitChapter = vi.fn();
const mockUseChapterPresence = vi.fn();
const mockUseResourceState = vi.fn();
const mockUseSaveResourceState = vi.fn();
const mockUseDrafting = vi.fn();
const mockUsePericope = vi.fn();

vi.mock('@/features/bible/hooks/useBibleTarget', () => ({
  useAddTranslatedVerse: () => mockUseAddTranslatedVerse() as unknown,
  useSubmitChapter: () => mockUseSubmitChapter() as unknown,
}));

vi.mock('@/features/bible/hooks/useChapterPresence', () => ({
  useChapterPresence: () => mockUseChapterPresence() as unknown,
}));

vi.mock('@/features/bible/hooks/useResourceStatePersistence', () => ({
  useResourceState: () => mockUseResourceState() as unknown,
  useSaveResourceState: () => mockUseSaveResourceState() as unknown,
}));

vi.mock('@/features/bible/hooks/useDrafting', () => ({
  useDrafting: (props: unknown) => mockUseDrafting(props) as unknown,
}));

vi.mock('@/features/bible/hooks/usePericope', () => ({
  usePericope: (props: unknown) => mockUsePericope(props) as unknown,
}));

// Mock the Repeated Word Check hooks (Phase 4). These wrap TanStack Query /
// fetch; this suite exercises drafting/pericope/resource behavior, not the
// check itself (which is unit-tested in `useRepeatedWordsCheck.test.ts` and the
// checks-feature component tests). Mocking them keeps DraftingUI renderable
// without a QueryClientProvider and with no network I/O.
vi.mock('@/features/checks/hooks/useSuppressions', () => ({
  useSuppressions: () => ({
    occurrenceRules: {},
    globalRules: {},
    globalIgnoresAvailable: false,
    settingsProbeResolved: true,
    ignoreHere: vi.fn(),
    ignoreEverywhere: vi.fn(),
    undoOccurrence: vi.fn(),
    stopIgnoringEverywhere: vi.fn(),
  }),
}));

vi.mock('@/features/checks/hooks/useRepeatedWordsCheck', () => ({
  useRepeatedWordsCheck: () => ({ data: undefined, isError: false }),
}));

vi.mock('@/features/checks/hooks/useResolvedFindings', () => ({
  useResolvedFindings: () => ({ active: [], inactive: [] }),
}));

// Mock the feature-flags selector. The Repeated Word Check tab/query are gated
// on `useFeatureFlag('repeatedWordCheck')` (feature-flags proposal D5–D7); this
// hook wraps TanStack Query / fetch, so mocking it keeps DraftingUI renderable
// with no network I/O. Default: feature ON, so the existing tests exercise the
// full Checks surface; individual tests flip `mockFeatureFlag` to false to
// assert the hidden state.
const mockFeatureFlag = vi.fn<(name: string) => boolean>(() => true);

vi.mock('@/features/flags', () => ({
  useFeatureFlag: (name: string) => mockFeatureFlag(name) as unknown,
}));

// Mock ResourcePanel
vi.mock('@/features/resources/components/ResourcePanel', () => ({
  ResourcePanel: ({
    activeVerseId,
    bibleResourceName,
    openResourceBiblePanel,
    onBibleVersesChange,
    selectPanel,
  }: {
    activeVerseId: number;
    bibleResourceName: (name: string) => void;
    openResourceBiblePanel: (open: boolean) => void;
    onBibleVersesChange: (verses: Array<{ verseNumber: number; text: string }>) => void;
    selectPanel: (panel: number) => void;
  }) => {
    const handleSelectBible = () => {
      bibleResourceName('Alternative Bible');
      openResourceBiblePanel(true);
      selectPanel(2);
      onBibleVersesChange([
        { verseNumber: 1, text: 'Alternative verse 1 text' },
        { verseNumber: 2, text: 'Alternative verse 2 text' },
      ]);
    };
    return (
      <div data-testid='mock-resource-panel'>
        <span>Mock Resource Panel - Active Verse {activeVerseId}</span>
        <button onClick={handleSelectBible}>Select Alternative Bible</button>
      </div>
    );
  },
}));

const mockProjectItem: ProjectItem = {
  chapterAssignmentId: 1,
  projectId: 100,
  projectName: 'Spanish Project',
  projectUnitId: 10,
  bibleId: 1,
  bibleName: 'WEB',
  targetLanguage: 'Spanish',
  targetLangCode: 'spa',
  bookId: 1,
  book: 'Genesis',
  chapterStatus: ChapterAssignmentStatus.DRAFT,
  chapterNumber: 1,
  totalVerses: 2,
  completedVerses: 0,
  submittedTime: null,
  bookCode: 'GEN',
  sourceLangCode: 'eng',
};

const mockSourceVerses: Source[] = [
  { id: 101, verseNumber: 1, text: 'In the beginning God created the heaven and the earth.' },
  { id: 102, verseNumber: 2, text: 'And the earth was without form, and void.' },
];

const mockTargetVerses: TargetVerse[] = [
  { verseNumber: 1, content: 'En el principio creó Dios los cielos y la tierra.' },
  { verseNumber: 2, content: '' },
];

const defaultDraftingHookResult = (overrides = {}) => ({
  verses: mockTargetVerses,
  activeVerseId: 1,
  revealedVerses: new Set([1]),
  buttonTop: 150,
  lastRevealedVerseHasContent: true,
  targetScrollRef: { current: null },
  textareaRefs: { current: {} },
  verseRefs: { current: {} },
  getSaveStatus: vi.fn(() => ({
    showLoader: false,
    hasRetryScheduled: false,
    hasUnsavedChanges: false,
  })),
  saveImmediately: vi.fn(),
  handleTextChange: vi.fn(),
  handleActiveVerseChange: vi.fn(),
  moveToNextVerse: vi.fn(),
  revealNextVerse: vi.fn(),
  updateButtonPosition: vi.fn(),
  ...overrides,
});

const defaultPericopeHookResult = (overrides = {}) => ({
  pericopes: [
    {
      pericopeNumber: '1',
      pericopeTitle: 'Creation',
      verses: [
        { chapterNumber: 1, verseNumber: 1 },
        { chapterNumber: 1, verseNumber: 2 },
      ],
    },
  ],
  isPericopeMode: false,
  isPericopeLoading: false,
  getPericopeStyle: vi.fn(() => 'border-border'),
  currentPericopeGroup: null,
  globalNextUntouchedVerse: null,
  resourceVerseId: 1,
  effectiveRevealedVerses: new Set([1]),
  isNextButtonEnabled: true,
  handleNextClick: vi.fn(),
  ...overrides,
});

describe('DraftingUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: Repeated Word Check feature ON (see mock definition above).
    mockFeatureFlag.mockReturnValue(true);

    mockUseAddTranslatedVerse.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockUseSubmitChapter.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockUseChapterPresence.mockReturnValue({
      editorName: null,
    });

    mockUseResourceState.mockReturnValue({
      data: null,
      isFetched: true,
    });

    mockUseSaveResourceState.mockReturnValue({
      mutate: vi.fn(),
    });

    // Default to Verse Mode
    useAppStore.setState({
      displayMode: 'verse',
      userdetail: { id: 1, username: 'testuser', role: 2 } as unknown as User,
    });

    mockUseDrafting.mockReturnValue(defaultDraftingHookResult());
    mockUsePericope.mockReturnValue(defaultPericopeHookResult());
  });

  it('renders correctly in Verse Mode', () => {
    render(
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={mockTargetVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
    );

    // Header info
    expect(screen.getByText('Genesis 1')).toBeInTheDocument();
    expect(screen.getByText('Spanish')).toBeInTheDocument();

    // Source texts in the grid
    expect(
      screen.getByText('In the beginning God created the heaven and the earth.')
    ).toBeInTheDocument();
    expect(screen.getByText('And the earth was without form, and void.')).toBeInTheDocument();

    // Target input fields (verse 1 should show its content)
    expect(
      screen.getByDisplayValue('En el principio creó Dios los cielos y la tierra.')
    ).toBeInTheDocument();
  });

  it('calls handleTextChange when typing in verse textarea', async () => {
    const user = userEvent.setup();
    const handleTextChangeMock = vi.fn();
    mockUseDrafting.mockReturnValue(
      defaultDraftingHookResult({
        handleTextChange: handleTextChangeMock,
      })
    );

    render(
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={mockTargetVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
    );

    const textarea = screen.getByLabelText('Translation for verse 1');
    await user.type(textarea, ' New text');

    expect(handleTextChangeMock).toHaveBeenCalledWith(1, expect.any(String));
  });

  it('renders in Pericope Mode when enabled', () => {
    // Set displayMode to pericope in store and hook
    useAppStore.setState({ displayMode: 'pericope' });
    mockUsePericope.mockReturnValue(
      defaultPericopeHookResult({
        isPericopeMode: true,
      })
    );

    render(
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={mockTargetVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
    );

    // Should display the Pericope Header
    expect(screen.getAllByText('Genesis 1:1-2')).toHaveLength(2);
    expect(
      screen.getByText('In the beginning God created the heaven and the earth.')
    ).toBeInTheDocument();
  });

  it('toggles the resources panel and interacts with the mocked ResourcePanel', async () => {
    const user = userEvent.setup();

    render(
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={mockTargetVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
    );

    // Resources should be hidden initially
    expect(screen.queryByTestId('mock-resource-panel')).not.toBeInTheDocument();

    // Toggle resources on
    const toggleButton = screen.getByRole('button', { pressed: false });
    await user.click(toggleButton);

    // Verify sidebar is rendered
    expect(screen.getByTestId('mock-resource-panel')).toBeInTheDocument();

    // Click inside the mocked ResourcePanel to set the Bible tab name and select it
    const selectBibleBtn = screen.getByRole('button', { name: 'Select Alternative Bible' });
    await user.click(selectBibleBtn);

    // The name "Alternative Bible" should appear as a tab
    expect(screen.getByRole('button', { name: 'Alternative Bible' })).toBeInTheDocument();

    // Check if the loaded alternative verses are rendered in place of the source verses
    expect(screen.getByText('Alternative verse 1 text')).toBeInTheDocument();
    expect(screen.getByText('Alternative verse 2 text')).toBeInTheDocument();

    // Close the alternative tab
    // (X is lucide icon next to tab)
    const closeSvg = screen.getByRole('button', { name: 'Alternative Bible' }).nextSibling;
    if (closeSvg) {
      await user.click(closeSvg as HTMLElement);
    }
    expect(screen.queryByRole('button', { name: 'Alternative Bible' })).not.toBeInTheDocument();
  });

  it('triggers submit workflow when translation is complete and submit button is clicked', async () => {
    const user = userEvent.setup();
    const mutateAsyncMock = vi.fn();
    mockUseSubmitChapter.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
    });

    // Make translation complete: 2 out of 2 verses completed
    const completedVerses = [
      { verseNumber: 1, content: 'complete verse 1' },
      { verseNumber: 2, content: 'complete verse 2' },
    ];
    mockUseDrafting.mockReturnValue(
      defaultDraftingHookResult({
        verses: completedVerses,
      })
    );

    render(
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={completedVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
    );

    // Find submit button in header (which is labeled with "Send to Peer Checking")
    const submitBtn = screen.getByRole('button', { name: /Send to Peer Checking/i });
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      chapterAssignmentId: mockProjectItem.chapterAssignmentId,
    });
  });

  it('shows Next Verse button if enabled and triggers handleNextClick', async () => {
    const user = userEvent.setup();
    const handleNextClickMock = vi.fn();
    mockUsePericope.mockReturnValue(
      defaultPericopeHookResult({
        isNextButtonEnabled: true,
        handleNextClick: handleNextClickMock,
        effectiveRevealedVerses: new Set([1]), // effective revealed < total (2)
      })
    );

    render(
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={mockTargetVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
    );

    const nextBtn = screen.getByRole('button', { name: 'Next Verse' });
    expect(nextBtn).toBeEnabled();

    await user.click(nextBtn);

    expect(handleNextClickMock).toHaveBeenCalled();
  });

  // --- Repeated Word Check feature flag (feature-flags proposal D5–D7) -------
  describe('Repeated Word Check feature flag', () => {
    const openResourcePanel = async (user: ReturnType<typeof userEvent.setup>) => {
      const toggleButton = screen.getByRole('button', { pressed: false });
      await user.click(toggleButton);
    };

    it('shows the Checks tab when the feature is enabled', async () => {
      const user = userEvent.setup();
      mockFeatureFlag.mockReturnValue(true);

      render(
        <DraftingUI
          projectItem={mockProjectItem}
          sourceVerses={mockSourceVerses}
          targetVerses={mockTargetVerses}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

      await openResourcePanel(user);

      expect(screen.getByRole('tab', { name: 'Resources' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Checks' })).toBeInTheDocument();
    });

    it('hides the Checks tab (feature looks unimplemented) when the feature is disabled', async () => {
      const user = userEvent.setup();
      mockFeatureFlag.mockReturnValue(false);

      render(
        <DraftingUI
          projectItem={mockProjectItem}
          sourceVerses={mockSourceVerses}
          targetVerses={mockTargetVerses}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

      await openResourcePanel(user);

      // Resources tab remains; the Checks tab is gone entirely.
      expect(screen.getByRole('tab', { name: 'Resources' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Checks' })).not.toBeInTheDocument();
    });

    it('only queries the flag for the repeatedWordCheck feature', () => {
      render(
        <DraftingUI
          projectItem={mockProjectItem}
          sourceVerses={mockSourceVerses}
          targetVerses={mockTargetVerses}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

      expect(mockFeatureFlag).toHaveBeenCalledWith('repeatedWordCheck');
    });
  });
});
