/**
 * Source-TTS drafting integration (§12.1 "Controls" / "Queue" / "Flags" rows).
 *
 * Scope: the wiring DraftingUI itself owns — panel-aware text and language
 * (T17/T18), document-order rows, the playback highlight, the gate (§6.3), and
 * the T16 prompt's mounting conditions. Playback sequencing lives in
 * `useTtsPlaybackQueue.test.ts` and the host composition in
 * `useSourceTtsPlayback.test.ts`, so both are stubbed here: this file drives
 * playback state directly and inspects what drafting handed over.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftingUI } from '@/features/bible/components/DraftingUI';
import type * as TtsFeature from '@/features/tts';
import {
  ChapterAssignmentStatus,
  type ProjectItem,
  type Source,
  type TargetVerse,
  type User,
} from '@/lib/types';

import type * as ReactRouter from '@tanstack/react-router';

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
    useRouter: () => ({ history: { back: mockBack } }),
  };
});

// i18n is mocked so accessible names are the inline defaults (no app instance).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string, options?: Record<string, unknown>) =>
      (defaultValue ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(options?.[name] ?? '')
      ),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// ── Drafting-side hooks (same shape as DraftingUI.test.tsx) ─────────────────
const mockSaveImmediately = vi.fn();
const mockVerseRefs: { current: Record<number, HTMLElement | null> } = { current: {} };
const mockTargetScrollRef: { current: HTMLElement | null } = { current: null };

vi.mock('@/features/bible/hooks/useBibleTarget', () => ({
  useAddTranslatedVerse: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitChapter: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/bible/hooks/useChapterPresence', () => ({
  useChapterPresence: () => ({ editorName: null }),
}));

vi.mock('@/features/bible/hooks/useResourceStatePersistence', () => ({
  useResourceState: () => ({ data: null, isFetched: true }),
  useSaveResourceState: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/features/bible/hooks/useAiSuggestions', () => ({
  useAiSuggestions: () => ({ suggestions: {}, isAiThresholdMet: false, suggestionStatus: 'idle' }),
  useTrackAiUsage: () => ({ mutate: vi.fn(), isPending: false }),
}));

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

const mockTargetVerses: TargetVerse[] = [
  { verseNumber: 1, content: 'En el principio creó Dios los cielos y la tierra.' },
  { verseNumber: 2, content: '' },
  { verseNumber: 3, content: '' },
];

/**
 * The verse the caret is in. Settable because it is NOT the playing verse
 * (T2) — the keyboard shortcuts act on this one, and a fixed value would let a
 * shortcut wired to a constant pass.
 */
let mockActiveVerseId = 1;

vi.mock('@/features/bible/hooks/useDrafting', () => ({
  useDrafting: () => ({
    verses: mockTargetVerses,
    get activeVerseId() {
      return mockActiveVerseId;
    },
    revealedVerses: new Set([1, 2, 3]),
    buttonTop: 150,
    lastRevealedVerseHasContent: true,
    lastRevealedVerseNumber: 3,
    targetScrollRef: mockTargetScrollRef,
    textareaRefs: { current: {} },
    verseRefs: mockVerseRefs,
    getSaveStatus: () => ({
      showLoader: false,
      hasRetryScheduled: false,
      hasUnsavedChanges: false,
    }),
    saveImmediately: mockSaveImmediately,
    handleTextChange: vi.fn(),
    handleActiveVerseChange: vi.fn(),
    moveToNextVerse: vi.fn(),
    revealNextVerse: vi.fn(),
    updateButtonPosition: vi.fn(),
  }),
}));

// G3a: pericope mode is off by default; the pericope suite flips it on.
let mockIsPericopeMode = false;
let mockPericopes: Array<{
  pericopeNumber: string;
  pericopeTitle: null;
  verses: Array<{ chapterNumber: number; verseNumber: number }>;
}> = [];

vi.mock('@/features/bible/hooks/usePericope', () => ({
  usePericope: () => ({
    pericopes: mockPericopes,
    isPericopeMode: mockIsPericopeMode,
    isPericopeLoading: false,
    getPericopeStyle: () => 'border-border',
    currentPericopeGroup: null,
    globalNextUntouchedVerse: null,
    resourceVerseId: 1,
    effectiveRevealedVerses: new Set([1, 2, 3]),
    isNextButtonEnabled: true,
    handleNextClick: vi.fn(),
  }),
}));

// ── Flags: every feature ON by default; tests flip sourceTts off ────────────
const mockFeatureFlag = vi.fn<(name: string) => boolean>(() => true);
vi.mock('@/features/flags', () => ({
  useFeatureFlag: (name: string) => mockFeatureFlag(name) as unknown,
}));

// ── The next-page lookup (T16): controllable, and its options captured ──────
let mockNextPage: TtsFeature.TtsNextPage | null = null;
let nextChapterOptions: { enabled: boolean; flushPendingWork: () => Promise<void> } | undefined;

vi.mock('@/features/bible/hooks/useNextAssignedChapter', () => ({
  useNextAssignedChapter: (options: {
    enabled: boolean;
    flushPendingWork: () => Promise<void>;
  }) => {
    nextChapterOptions = options;
    return mockNextPage;
  },
}));

// ── Playback: stubbed, so this file can drive state and read the rows ───────
let ttsRows: readonly TtsFeature.TtsRowDraft[] = [];
let activeVerseRef: string | null = null;
let isBusy = false;
const playVerse = vi.fn();
const playFromVerse = vi.fn();
const playGroup = vi.fn();
const stopPlayback = vi.fn();
const boundaryOnContinue = vi.fn();
const boundaryOnDismiss = vi.fn();
let boundaryOpen = false;

vi.mock('@/features/tts', async importOriginal => {
  const actual = await importOriginal<typeof TtsFeature>();
  return {
    ...actual,
    ServerTtsEngine: class {
      synthesize = vi.fn();
    },
    useSourceTtsPlayback: (options: {
      rows: readonly TtsFeature.TtsRowDraft[];
    }): TtsFeature.SourceTtsPlaybackApi => {
      ttsRows = options.rows;
      const playable = new Set(
        options.rows
          .filter(row => typeof row.text === 'string' && row.text.trim() !== '')
          .map(row => row.verseRef)
      );
      return {
        status: isBusy ? 'playing' : 'idle',
        activeVerseRef,
        isBusy,
        isRowPlayable: (verseRef: string) => playable.has(verseRef),
        isRowLoading: () => false,
        playVerse,
        playFromVerse,
        playGroup,
        // G3a: the real hook derives this from `activeVerseRef`, so the double
        // does too — a group is speaking iff it contains the playing row.
        isGroupSpeaking: (verseRefs: readonly string[]) =>
          activeVerseRef !== null && verseRefs.includes(activeVerseRef),
        stop: stopPlayback,
        boundaryPrompt: {
          open: boundaryOpen,
          nextPageLabel: mockNextPage?.label ?? '',
          isContinuing: false,
          onContinue: boundaryOnContinue,
          onDismiss: boundaryOnDismiss,
        },
      };
    },
  };
});

// Panel 2 is missing verse 3 on purpose (§5.1): a reference Bible with a hole.
vi.mock('@/features/resources/components/ResourcePanel', () => ({
  ResourcePanel: ({
    onBibleVersesChange,
    selectPanel,
    bibleResourceName,
    openResourceBiblePanel,
    onLanguageChange,
  }: {
    onBibleVersesChange: (verses: Array<{ verseNumber: number; text: string }>) => void;
    selectPanel: (panel: number) => void;
    bibleResourceName: (name: string) => void;
    openResourceBiblePanel: (open: boolean) => void;
    onLanguageChange?: (langCode: string) => void;
  }) => (
    <div data-testid='mock-resource-panel'>
      <button
        onClick={() => {
          bibleResourceName('Hindi Bible');
          openResourceBiblePanel(true);
          selectPanel(2);
          onLanguageChange?.('hin');
          onBibleVersesChange([
            { verseNumber: 1, text: 'Hindi verse 1' },
            { verseNumber: 2, text: 'Hindi verse 2' },
          ]);
        }}
      >
        Select Alternative Bible
      </button>
    </div>
  ),
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
  totalVerses: 3,
  completedVerses: 0,
  submittedTime: null,
  bookCode: 'GEN',
  sourceLangCode: 'eng',
};

const mockSourceVerses: Source[] = [
  { id: 101, verseNumber: 1, text: 'In the beginning God created the heaven and the earth.' },
  { id: 102, verseNumber: 2, text: 'And the earth was without form, and void.' },
  { id: 103, verseNumber: 3, text: 'And God said, Let there be light.' },
];

const renderDrafting = () =>
  render(
    <DraftingUI
      projectItem={mockProjectItem}
      sourceVerses={mockSourceVerses}
      targetVerses={mockTargetVerses}
      userdetail={{ id: 1 } as unknown as User}
    />
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockFeatureFlag.mockReturnValue(true);
  mockNextPage = null;
  nextChapterOptions = undefined;
  ttsRows = [];
  mockActiveVerseId = 1;
  activeVerseRef = null;
  isBusy = false;
  boundaryOpen = false;
  mockVerseRefs.current = {};
  mockTargetScrollRef.current = null;
  mockIsPericopeMode = false;
  mockPericopes = [];
});

/**
 * The resource area starts collapsed; its toggle is the only aria-pressed
 * button on the page (the TTS controls are plain buttons).
 */
const openResourceArea = async () => {
  await userEvent.click(screen.getByRole('button', { pressed: false }));
};

/** Switch the resource area to panel 2 (a reference Bible) via its own UI. */
const selectReferenceBible = async () => {
  await openResourceArea();
  await userEvent.click(screen.getByRole('button', { name: 'Select Alternative Bible' }));
};

// ── Flags (§6.3, T12) ───────────────────────────────────────────────────────

describe('DraftingUI — source-TTS gate', () => {
  it('renders no controls and no prompt when the feature is off', () => {
    mockFeatureFlag.mockImplementation(name => name !== 'sourceTts');
    mockNextPage = { label: 'Genesis 2', pageKey: 'chapter-2', navigate: vi.fn() };
    boundaryOpen = true;

    renderDrafting();

    expect(screen.queryAllByTestId('tts-verse-controls')).toHaveLength(0);
    expect(screen.queryByTestId('tts-boundary-prompt')).not.toBeInTheDocument();
  });

  it('asks the flag service for sourceTts by name', () => {
    renderDrafting();

    expect(mockFeatureFlag).toHaveBeenCalledWith('sourceTts');
  });

  it('shows one set of controls per source verse when the feature is on', () => {
    renderDrafting();

    expect(screen.getAllByTestId('tts-verse-controls')).toHaveLength(3);
  });
});

// ── Controls: panel-aware text and language (T17/T18, §5.1) ─────────────────

describe('DraftingUI — panel-aware TTS rows', () => {
  it('panel 1 reads the project source text in the project source language', () => {
    renderDrafting();

    expect(ttsRows).toEqual([
      {
        verseRef: '1',
        text: 'In the beginning God created the heaven and the earth.',
        langCode: 'eng',
        audioSource: 'projectSource',
      },
      {
        verseRef: '2',
        text: 'And the earth was without form, and void.',
        langCode: 'eng',
        audioSource: 'projectSource',
      },
      {
        verseRef: '3',
        text: 'And God said, Let there be light.',
        langCode: 'eng',
        audioSource: 'projectSource',
      },
    ]);
  });

  it('panel 2 reads the reference Bible its own text and its own language (T17)', async () => {
    renderDrafting();

    await selectReferenceBible();

    // Not the project source text, and not the project source langCode —
    // reading Hindi text as English is the bug this guards.
    expect(ttsRows.slice(0, 2)).toEqual([
      { verseRef: '1', text: 'Hindi verse 1', langCode: 'hin', audioSource: 'referenceBible' },
      { verseRef: '2', text: 'Hindi verse 2', langCode: 'hin', audioSource: 'referenceBible' },
    ]);
  });

  it('hands rows over in document order regardless of panel', async () => {
    renderDrafting();
    expect(ttsRows.map(row => row.verseRef)).toEqual(['1', '2', '3']);

    await selectReferenceBible();
    expect(ttsRows.map(row => row.verseRef)).toEqual(['1', '2', '3']);
  });

  it('disables both play actions for a verse the reference Bible lacks (§5.1)', async () => {
    renderDrafting();

    await selectReferenceBible();

    // Panel 2 supplied verses 1 and 2 only, so verse 3 has no text to read.
    expect(screen.getByRole('button', { name: 'Play verse 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Play verse 3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play from verse 3' })).toBeDisabled();
  });
});

// ── Queue actions and highlight (§5.3) ──────────────────────────────────────

describe('DraftingUI — playback actions and highlight', () => {
  it('routes the two play actions to the verse that was clicked', async () => {
    renderDrafting();

    await userEvent.click(screen.getByRole('button', { name: 'Play verse 2' }));
    expect(playVerse).toHaveBeenCalledWith('2');

    await userEvent.click(screen.getByRole('button', { name: 'Play from verse 3' }));
    expect(playFromVerse).toHaveBeenCalledWith('3');
  });

  it('marks only the playing row, and marks it by verse', () => {
    activeVerseRef = '2';

    renderDrafting();

    const active = screen.getAllByTestId('tts-active-row');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('data-verse-number', '2');
  });

  it('marks no row when nothing is playing', () => {
    renderDrafting();

    expect(screen.queryAllByTestId('tts-active-row')).toHaveLength(0);
  });

  it('hides Stop while nothing is playing', () => {
    renderDrafting();

    expect(screen.queryAllByRole('button', { name: 'Stop playback' })).toHaveLength(0);
  });

  it('offers a queue-wide Stop while playback is live', async () => {
    isBusy = true;
    activeVerseRef = '1';

    renderDrafting();

    // Queue-wide (§5.1): Stop is reachable from any row, not just the playing one.
    const stops = screen.getAllByRole('button', { name: 'Stop playback' });
    expect(stops).toHaveLength(3);
    await userEvent.click(stops[2]);
    expect(stopPlayback).toHaveBeenCalledTimes(1);
  });
});

// ── Keyboard shortcuts (§12.1 Keyboard row) ─────────────────────────────────

/**
 * These press real keys at the window, deliberately.
 *
 * `useTtsKeyboardShortcuts` had a full unit-test file of its own and passed it
 * — because that file calls the hook directly. **No component had ever
 * mounted it**, so every shortcut was inert in the running app while
 * `TtsVerseControls` advertised all three in its tooltips. Found in a browser
 * on 2026-08-16 (phase 09), invisible to 397 tests.
 *
 * The lesson these tests encode: a hook's own unit test cannot prove the hook
 * is wired. Only the host can, and this file is the host's.
 */
describe('DraftingUI — keyboard shortcuts', () => {
  it('Alt+P plays the verse the caret is in, not the one that is playing', async () => {
    // The two are different on purpose (T2): a translator types in verse 4
    // while verse 2 is read aloud, and Alt+P must play 4.
    activeVerseRef = '2';
    mockActiveVerseId = 3;

    renderDrafting();
    await userEvent.keyboard('{Alt>}p{/Alt}');

    expect(playVerse).toHaveBeenCalledWith('3');
  });

  it('Alt+Shift+P plays onward from the caret', async () => {
    mockActiveVerseId = 2;

    renderDrafting();
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');

    expect(playFromVerse).toHaveBeenCalledWith('2');
    expect(playVerse).not.toHaveBeenCalled();
  });

  it('Alt+S stops', async () => {
    isBusy = true;
    renderDrafting();

    await userEvent.keyboard('{Alt>}s{/Alt}');

    expect(stopPlayback).toHaveBeenCalledTimes(1);
  });

  it('is silent while the feature is off (§6.3)', async () => {
    mockFeatureFlag.mockImplementation(name => name !== 'sourceTts');

    renderDrafting();

    await userEvent.keyboard('{Alt>}p{/Alt}');
    await userEvent.keyboard('{Alt>}s{/Alt}');

    expect(playVerse).not.toHaveBeenCalled();
    expect(stopPlayback).not.toHaveBeenCalled();
  });
});

// ── Boundary prompt mounting (T16) ──────────────────────────────────────────

describe('DraftingUI — end-of-chapter prompt', () => {
  it('is not mounted at all when no next chapter is assigned to this user', () => {
    boundaryOpen = true;

    renderDrafting();

    expect(screen.queryByTestId('tts-boundary-prompt')).not.toBeInTheDocument();
  });

  it('names the next chapter when one is assigned', () => {
    mockNextPage = { label: 'Genesis 2', pageKey: 'chapter-2', navigate: vi.fn() };
    boundaryOpen = true;

    renderDrafting();

    expect(screen.getByTestId('tts-boundary-prompt')).toBeInTheDocument();
    expect(screen.getByText(/Continue with Genesis 2\?/)).toBeInTheDocument();
  });

  it('flushes the verse under the caret before any TTS-driven page change', async () => {
    renderDrafting();

    expect(nextChapterOptions?.enabled).toBe(true);
    await nextChapterOptions?.flushPendingWork();

    // The debounced save is committed for the ACTIVE verse, not the whole page.
    expect(mockSaveImmediately).toHaveBeenCalledWith(
      1,
      'En el principio creó Dios los cielos y la tierra.'
    );
  });

  it('does not look for a next chapter while the feature is off', () => {
    mockFeatureFlag.mockImplementation(name => name !== 'sourceTts');

    renderDrafting();

    // Flag-off must not add a request for the assignment list.
    expect(nextChapterOptions?.enabled).toBe(false);
  });
});

// ── Regression guard: the shipped Checks surface is untouched ───────────────

describe('DraftingUI — Checks panel coexistence', () => {
  it('keeps the repeated-word Checks tab working with TTS enabled', async () => {
    renderDrafting();

    await openResourceArea();

    expect(screen.getByRole('tab', { name: 'Resources' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Checks' })).toBeInTheDocument();
    expect(screen.getAllByTestId('tts-verse-controls').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// G3a — pericope mode: group controls, group highlight, bounded playback
// ---------------------------------------------------------------------------

/** Two groups over the three source verses: 1-2, then 3 (the page's last row). */
const twoPericopeGroups = [
  {
    pericopeNumber: '1',
    pericopeTitle: null,
    verses: [
      { chapterNumber: 1, verseNumber: 1 },
      { chapterNumber: 1, verseNumber: 2 },
    ],
  },
  {
    pericopeNumber: '2',
    pericopeTitle: null,
    verses: [{ chapterNumber: 1, verseNumber: 3 }],
  },
];

const enterPericopeMode = () => {
  mockIsPericopeMode = true;
  mockPericopes = twoPericopeGroups;
};

describe('DraftingUI — pericope mode TTS (G3a)', () => {
  it('renders one group control per pericope, and no per-verse controls', () => {
    enterPericopeMode();

    renderDrafting();

    expect(screen.getAllByTestId('tts-group-controls')).toHaveLength(2);
    // The verse trio would offer "play from here", which is exactly the
    // behaviour a group control must not have.
    expect(screen.queryAllByTestId('tts-verse-controls')).toHaveLength(0);
  });

  it('plays the whole blob — the group control passes ITS verses, not just the first', async () => {
    // This is the failure the operator named: a group control that plays only
    // the group's first verse would be strange.
    enterPericopeMode();

    renderDrafting();

    await userEvent.click(screen.getByRole('button', { name: 'Play pericope 1:1-2' }));

    expect(playGroup).toHaveBeenCalledWith(['1', '2']);
    // Bounded playback is playGroup's job; the page-wide actions stay unused.
    expect(playFromVerse).not.toHaveBeenCalled();
    expect(playVerse).not.toHaveBeenCalled();
  });

  it('washes the group that contains the playing verse, and only that group', () => {
    enterPericopeMode();
    activeVerseRef = '2'; // verse 2 lives in the first group

    renderDrafting();

    const speaking = screen.getAllByTestId('tts-active-group');
    expect(speaking).toHaveLength(1);
    expect(speaking[0]).toHaveTextContent('And the earth was without form');
  });

  it('offers Stop on every group while the queue is busy (§5.1 is queue-wide)', () => {
    enterPericopeMode();
    isBusy = true;
    activeVerseRef = '1';

    renderDrafting();

    expect(screen.getAllByRole('button', { name: /Stop playback/ })).toHaveLength(2);
  });

  it('renders no TTS at all in pericope mode when the flag is off', () => {
    enterPericopeMode();
    mockFeatureFlag.mockImplementation((name: string) => name !== 'sourceTts');

    renderDrafting();

    expect(screen.queryAllByTestId('tts-group-controls')).toHaveLength(0);
    expect(screen.queryAllByTestId('tts-active-group')).toHaveLength(0);
  });
});
