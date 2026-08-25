import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftingUI } from '@/features/bible/components/DraftingUI';
import { config } from '@/lib/config';
import {
  ChapterAssignmentStatus,
  type ProjectItem,
  type Source,
  type TargetVerse,
  type User,
  type VerseMarkers,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

import type * as ReactRouter from '@tanstack/react-router';

// Mock TanStack Router
const { mockNavigate, mockBack, mockUseLocation } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockBack: vi.fn(),
  mockUseLocation: vi.fn().mockReturnValue({ pathname: '/test', search: {} }),
}));

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof ReactRouter>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    useLocation: () => mockUseLocation(),
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

const mockUseAiSuggestions = vi.fn(() => ({
  suggestions: {} as Record<number, string>,
  isAiThresholdMet: false,
  suggestionStatus: 'idle',
}));

vi.mock('@/features/bible/hooks/useAiSuggestions', () => ({
  useAiSuggestions: () => mockUseAiSuggestions(),
  useTrackAiUsage: () => ({ mutate: vi.fn(), isPending: false }),
}));

// The rich text surface is covered in `PericopeRteGroup.test.tsx`; standing it in here keeps the
// ~180 KB editor out of this suite while still exercising the flag's branch.
vi.mock('@/features/bible/components/PericopeRteGroup', () => ({
  PericopeRteGroup: () => <div data-testid='pericope-rte-group' />,
}));

/**
 * The chapter view travels as its own chunk, and what the pane shows while it is in flight is the
 * point of the suite at the bottom of this file. The mocked module resolves only when a test lets
 * it, which is the slow connection the fallback exists for.
 */
const chapterChunk = vi.hoisted(() => {
  let arrive = () => {};
  const onTheWire = new Promise<void>(resolve => {
    arrive = resolve;
  });
  return { onTheWire, deliver: () => arrive() };
});

vi.mock('@/features/bible/components/DraftingChapterView', async () => {
  await chapterChunk.onTheWire;
  return { DraftingChapterView: () => <div data-testid='chapter-view' /> };
});

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
    // A Bible with nothing for this passage: panel 2 is selected but has no verses, which is what
    // puts the drafting page on its panel-two placeholder.
    const handleSelectEmptyBible = () => {
      bibleResourceName('Empty Bible');
      openResourceBiblePanel(true);
      selectPanel(2);
      onBibleVersesChange([]);
    };
    return (
      <div data-testid='mock-resource-panel'>
        <span>Mock Resource Panel - Active Verse {activeVerseId}</span>
        <button onClick={handleSelectBible}>Select Alternative Bible</button>
        <button onClick={handleSelectEmptyBible}>Select Empty Bible</button>
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
  lastRevealedVerseNumber: 1,
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
  handleNextPericopeClick: vi.fn(),
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
      userdetail: { id: 1, username: 'testuser', role: 'Project Translator' } as unknown as User,
    });

    mockUseDrafting.mockReturnValue(defaultDraftingHookResult());
    mockUsePericope.mockReturnValue(defaultPericopeHookResult());
    mockUseAiSuggestions.mockReturnValue({
      suggestions: {},
      isAiThresholdMet: false,
      suggestionStatus: 'idle',
    });
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

    // The tracking wrapper always forwards a markers slot; the textarea derives none.
    expect(handleTextChangeMock).toHaveBeenCalledWith(1, expect.any(String), undefined);
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
    expect(screen.getAllByText('1:1-2')).toHaveLength(2);
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

  it('renders a vertical divider between the tabs on the Source side when the second tab is open', async () => {
    const user = userEvent.setup();

    render(
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={mockTargetVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
    );

    // Open resource sidebar
    const toggleButton = screen.getByRole('button', { pressed: false });
    await user.click(toggleButton);

    // Select alternative bible
    const selectBibleBtn = screen.getByRole('button', { name: 'Select Alternative Bible' });
    await user.click(selectBibleBtn);

    // Verify the primary tab and alternative tab are both rendered
    expect(screen.getByRole('button', { name: 'WEB' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alternative Bible' })).toBeInTheDocument();

    // Verify the divider is rendered between them
    expect(screen.getByText('|')).toBeInTheDocument();
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
  describe('AI suggestion auto-population', () => {
    const EMPTY_PERICOPE: TargetVerse[] = [
      { verseNumber: 1, content: '' },
      { verseNumber: 2, content: '' },
    ];

    const CURRENT_GROUP = {
      pericopeNumber: '1',
      pericopeTitle: 'Creation',
      verses: [
        { chapterNumber: 1, verseNumber: 1 },
        { chapterNumber: 1, verseNumber: 2 },
      ],
    };

    let handleTextChange: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      handleTextChange = vi.fn();
      mockUseDrafting.mockReturnValue(
        defaultDraftingHookResult({ verses: EMPTY_PERICOPE, handleTextChange })
      );
      mockUsePericope.mockReturnValue(
        defaultPericopeHookResult({ isPericopeMode: true, currentPericopeGroup: CURRENT_GROUP })
      );
      mockUseAiSuggestions.mockReturnValue({
        suggestions: { 1: 'Suggestion for 1', 2: 'Suggestion for 2' },
        isAiThresholdMet: true,
        suggestionStatus: 'idle',
      });
      useAppStore.setState({ displayMode: 'pericope' });
    });

    afterEach(() => {
      config.features.rtePericope = false;
    });

    const renderWithAi = () =>
      render(
        <DraftingUI
          projectItem={{ ...mockProjectItem, isAiEnabled: true }}
          sourceVerses={mockSourceVerses}
          targetVerses={EMPTY_PERICOPE}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

    it('populates every verse of the pericope in the rich text surface', () => {
      config.features.rtePericope = true;

      renderWithAi();

      // Verse 2 is not the active verse, but the whole pericope is on screen, so it fills too.
      // Neither verse has markers stored, so neither fill claims an opinion about them.
      expect(handleTextChange).toHaveBeenCalledWith(1, 'Suggestion for 1', undefined);
      expect(handleTextChange).toHaveBeenCalledWith(2, 'Suggestion for 2', undefined);
    });

    it('still fills only the verse in focus on the textarea path', () => {
      config.features.rtePericope = false;

      renderWithAi();

      expect(handleTextChange).toHaveBeenCalledWith(1, 'Suggestion for 1', undefined);
      expect(handleTextChange).not.toHaveBeenCalledWith(2, 'Suggestion for 2', undefined);
    });

    it('keeps the stored paragraph of a verse it fills all the way into the request', async () => {
      config.features.rtePericope = true;
      const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);
      mockUseAddTranslatedVerse.mockReturnValue({ mutateAsync: mutateAsyncMock, isPending: false });

      // The translator laid the pericope out before drafting it and left verse 2 empty, so verse 2
      // opens a paragraph that holds nothing yet.
      const opensParagraph: VerseMarkers = { paragraphs: [{ marker: 'p', offset: 0 }] };
      const laidOut: TargetVerse[] = [
        { verseNumber: 1, content: 'Ya traducido.' },
        { verseNumber: 2, content: '', markers: opensParagraph },
      ];
      mockUseDrafting.mockReturnValue(
        defaultDraftingHookResult({ verses: laidOut, handleTextChange })
      );

      render(
        <DraftingUI
          projectItem={{ ...mockProjectItem, isAiEnabled: true }}
          sourceVerses={mockSourceVerses}
          targetVerses={laidOut}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

      // Whatever the auto-fill handed the drafting hook is what the hook debounces into a save, so
      // the two halves compose into the trip the suggestion really makes.
      const fills = handleTextChange.mock.calls as Array<
        [number, string, VerseMarkers | undefined]
      >;
      const [, filledText, filledMarkers] = fills.find(([verseNumber]) => verseNumber === 2) ?? [];
      expect(filledText).toBe('Suggestion for 2');

      const { onSave } = mockUseDrafting.mock.calls[0][0] as {
        onSave: (
          verse: number,
          payload: { content: string; markers?: VerseMarkers | null }
        ) => Promise<void>;
      };
      await onSave(2, { content: filledText ?? '', markers: filledMarkers });

      // Omitting the field would null the stored paragraph server side (fluent-api#264): the
      // editor would keep showing it and the structure would be gone on the next reload.
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        verseData: expect.objectContaining({
          content: 'Suggestion for 2',
          markers: opensParagraph,
        }) as unknown,
      });
    });
  });

  describe('panel two placeholder', () => {
    afterEach(() => {
      config.features.rtePericope = false;
    });

    const renderInPericopeMode = async (user: ReturnType<typeof userEvent.setup>) => {
      mockUsePericope.mockReturnValue(defaultPericopeHookResult({ isPericopeMode: true }));
      useAppStore.setState({ displayMode: 'pericope' });

      render(
        <DraftingUI
          projectItem={mockProjectItem}
          sourceVerses={mockSourceVerses}
          targetVerses={mockTargetVerses}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

      await user.click(screen.getByRole('button', { pressed: false }));
      await user.click(screen.getByRole('button', { name: 'Select Empty Bible' }));

      // The placeholder has taken the grid's place: its message replaces the source column.
      expect(
        screen.queryByText('In the beginning God created the heaven and the earth.')
      ).not.toBeInTheDocument();
    };

    it('keeps the rich text editor when the resource panel has nothing to show', async () => {
      const user = userEvent.setup();
      config.features.rtePericope = true;

      await renderInPericopeMode(user);

      expect(screen.getByTestId('pericope-rte-group')).toBeInTheDocument();
      expect(screen.queryByLabelText('Translation for verse 1')).not.toBeInTheDocument();
    });

    it('keeps the textareas there without the flag', async () => {
      const user = userEvent.setup();
      config.features.rtePericope = false;

      await renderInPericopeMode(user);

      expect(screen.getByLabelText('Translation for verse 1')).toBeInTheDocument();
      expect(screen.queryByTestId('pericope-rte-group')).not.toBeInTheDocument();
    });
  });

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

  describe('verse save payload', () => {
    it('maps markers into the upsert, omitting the field when the caller derived none', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);
      mockUseAddTranslatedVerse.mockReturnValue({ mutateAsync: mutateAsyncMock, isPending: false });

      render(
        <DraftingUI
          projectItem={mockProjectItem}
          sourceVerses={mockSourceVerses}
          targetVerses={mockTargetVerses}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

      const { onSave } = mockUseDrafting.mock.calls[0][0] as {
        onSave: (
          verse: number,
          payload: { content: string; markers?: VerseMarkers | null }
        ) => Promise<void>;
      };
      const split: VerseMarkers = {
        paragraphs: [
          { marker: 'p', offset: 0 },
          { marker: 'p', offset: 12 },
        ],
      };

      // The RTE path: markers ride along, and the content goes through as given.
      await onSave(1, { content: 'Starts here and continues.', markers: split });
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        verseData: expect.objectContaining({
          content: 'Starts here and continues.',
          markers: split,
        }) as unknown,
      });

      // The textarea path: no opinion on markers, so the field stays out of the request body.
      await onSave(1, { content: 'Plain textarea text.' });
      const lastCall = mutateAsyncMock.mock.calls.at(-1)?.[0] as {
        verseData: Record<string, unknown>;
      };
      expect('markers' in lastCall.verseData).toBe(false);
    });

    it('sends content the marker offsets were measured against, unmodified', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);
      mockUseAddTranslatedVerse.mockReturnValue({ mutateAsync: mutateAsyncMock, isPending: false });

      render(
        <DraftingUI
          projectItem={mockProjectItem}
          sourceVerses={mockSourceVerses}
          targetVerses={mockTargetVerses}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

      const { onSave } = mockUseDrafting.mock.calls[0][0] as {
        onSave: (
          verse: number,
          payload: { content: string; markers?: VerseMarkers | null }
        ) => Promise<void>;
      };

      // Offsets are positions in the string the caller measured. Trimming that string underneath
      // them shifts every nonzero offset and can push one past the end of what is stored, so a
      // reload would restore paragraph breaks in the wrong places.
      const padded = '  Starts here and continues.  ';
      const markers: VerseMarkers = {
        paragraphs: [
          { marker: 'p', offset: 0 },
          { marker: 'p', offset: padded.length - 4 },
        ],
      };

      await onSave(1, { content: padded, markers });

      expect(mutateAsyncMock).toHaveBeenCalledWith({
        verseData: expect.objectContaining({ content: padded, markers }) as unknown,
      });
    });

    it('still trims on the textarea path, which carries no offsets', async () => {
      const mutateAsyncMock = vi.fn().mockResolvedValue(undefined);
      mockUseAddTranslatedVerse.mockReturnValue({ mutateAsync: mutateAsyncMock, isPending: false });

      render(
        <DraftingUI
          projectItem={mockProjectItem}
          sourceVerses={mockSourceVerses}
          targetVerses={mockTargetVerses}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

      const { onSave } = mockUseDrafting.mock.calls[0][0] as {
        onSave: (
          verse: number,
          payload: { content: string; markers?: VerseMarkers | null }
        ) => Promise<void>;
      };

      await onSave(1, { content: '  Plain textarea text.  ' });

      expect(mutateAsyncMock).toHaveBeenCalledWith({
        verseData: expect.objectContaining({ content: 'Plain textarea text.' }) as unknown,
      });
    });
  });

  describe('chapter mode', () => {
    afterEach(() => {
      config.features.rtePericope = false;
    });

    it('holds the pane open while the chapter chunk is still on the wire', async () => {
      config.features.rtePericope = true;
      useAppStore.setState({ displayMode: 'chapter' });

      render(
        <DraftingUI
          projectItem={mockProjectItem}
          sourceVerses={mockSourceVerses}
          targetVerses={mockTargetVerses}
          userdetail={{ id: 1 } as unknown as User}
        />
      );

      // An empty fallback leaves a blank pane, which reads as a chapter with nothing in it rather
      // than as one still arriving.
      expect(screen.getByTestId('chapter-view-loading')).toBeInTheDocument();

      chapterChunk.deliver();

      expect(await screen.findByTestId('chapter-view')).toBeInTheDocument();
      expect(screen.queryByTestId('chapter-view-loading')).not.toBeInTheDocument();
    });
  });
});
