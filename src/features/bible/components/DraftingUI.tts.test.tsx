/**
 * Source-TTS drafting integration (§12.1 "Controls" / "Queue" / "Flags" rows).
 *
 * Scope: the wiring DraftingUI itself owns — panel-aware text and language
 * (T17/T18), document-order rows, the playback highlight, and the gate (§6.3).
 * Playback sequencing lives in
 * `useTtsPlaybackQueue.test.ts` and the host composition in
 * `useSourceTtsPlayback.test.ts`, so both are stubbed here: this file drives
 * playback state directly and inspects what drafting handed over.
 */
import { useLayoutEffect } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftingUI } from '@/features/bible/components/DraftingUI';
import type * as TtsFeature from '@/features/tts';
import { PlaybackRegistryProvider, usePlaybackRegistry } from '@/features/tts';
import type * as AudioModule from '@/features/tts/lib/audioElement';
import type * as SourceClient from '@/features/tts/resolver/sourceAudioClient';
import { FakeClipElement } from '@/features/tts/testing/fakeClipElement';
import { windowlessChapter } from '@/features/tts/testing/sourceAudioFixtures';
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

// ── Flags: every feature ON by default; tests flip sourceAudio off ────────────
const mockFeatureFlag = vi.fn<(name: string) => boolean>(() => true);
let mockOverrides: Record<string, boolean> = {};
vi.mock('@/features/flags', () => ({
  useFeatureFlag: (name: string) => mockFeatureFlag(name) as unknown,
  // DraftingUI takes BOTH the merged flag and the raw override from this one
  // hook, because `flagOverrides.ts` permits exactly one override read site.
  useFeatureFlags: () => ({
    features: { sourceAudio: mockFeatureFlag('sourceAudio'), repeatedWordCheck: true },
    overrides: mockOverrides,
  }),
}));

// ── Playback: stubbed, so this file can drive state and read the rows ───────
let ttsRows: readonly TtsFeature.SourceAudioRow[] = [];
let realPlayback = false;
let playback: TtsFeature.SourceTtsPlaybackApi;
let registry: TtsFeature.PlaybackRegistry;
let referenceBibleId: string | null;
let capturedPageKey: string | undefined;
const elements: FakeClipElement[] = [];
const initialClaimPause = vi.fn();
const synthesize = vi.fn<TtsFeature.TtsEngine['synthesize']>();

vi.mock('@/features/tts/resolver/sourceAudioClient', async importOriginal => ({
  ...(await importOriginal<typeof SourceClient>()),
  fetchChapterSourceAudio: vi.fn(async () => windowlessChapter()),
}));
vi.mock('@/features/tts/lib/audioElement', async importOriginal => ({
  ...(await importOriginal<typeof AudioModule>()),
  createClipAudioElement: (src: string) => {
    const element = new FakeClipElement();
    element.src = src;
    elements.push(element);
    return element;
  },
}));
let sourceChapter: TtsFeature.ChapterSourceAudioRequest | null;
let ttsServed: Record<string, TtsFeature.TtsServedFormat> = {};
let ttsPlaybackEnabled: boolean | undefined;
let activeVerseRef: string | null = null;
let isBusy = false;
const playVerse = vi.fn();
const playFromVerse = vi.fn();
const playGroup = vi.fn();
const playFromGroup = vi.fn();
const stopPlayback = vi.fn();
const pausePlayback = vi.fn();

vi.mock('@/features/tts', async importOriginal => {
  const actual = await importOriginal<typeof TtsFeature>();
  return {
    ...actual,
    ServerTtsEngine: class {
      synthesize = synthesize;
    },
    useSourceTtsPlayback: (
      options: TtsFeature.UseSourceTtsPlaybackOptions
    ): TtsFeature.SourceTtsPlaybackApi => {
      ttsRows = options.rows;
      referenceBibleId = options.referenceBibleId;
      capturedPageKey = options.pageKey;
      sourceChapter = options.sourceChapter;
      ttsPlaybackEnabled = options.enabled;
      // Fixed for the entire mount; only the source-switch suite uses the real host/queue.
      if (realPlayback) {
        playback = actual.useSourceTtsPlayback(options);
        return playback;
      }
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
        servingFor: (verseRef: string) => ttsServed[verseRef],
        playVerse,
        playFromVerse,
        playGroup,
        playFromGroup,
        // G3a: the real hook derives this from `activeVerseRef`, so the double
        // does too — a group is speaking iff it contains the playing row.
        isGroupSpeaking: (verseRefs: readonly string[]) =>
          activeVerseRef !== null && verseRefs.includes(activeVerseRef),
        pause: pausePlayback,
        stop: stopPlayback,
        restartVerse: vi.fn(),
        restartGroup: vi.fn(),
        verseKey: () => null,
        groupKey: () => null,
      };
    },
  };
});

// Panel 2 is missing verse 3 on purpose (§5.1): a reference Bible with a hole.
vi.mock('@/features/resources/components/ResourcePanel', () => ({
  ResourcePanel: ({
    onBibleVersesChange,
    onBibleIdentityChange,
    selectPanel,
    bibleResourceName,
    openResourceBiblePanel,
    onLanguageChange,
  }: {
    onBibleVersesChange: (verses: Array<{ verseNumber: number; text: string }>) => void;
    onBibleIdentityChange: (id: string) => void;
    selectPanel: (panel: number) => void;
    bibleResourceName: (name: string) => void;
    openResourceBiblePanel: (open: boolean) => void;
    onLanguageChange?: (langCode: string) => void;
  }) => (
    <div data-testid='mock-resource-panel'>
      <button
        onClick={() => {
          onBibleIdentityChange('aq-123');
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
      <button onClick={() => onBibleIdentityChange('yv-123')}>
        Select Same Text From Other Domain
      </button>
      <button onClick={() => bibleResourceName('Renamed Bible')}>Rename Selected Bible</button>
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

const RegistryProbe = () => {
  const currentRegistry = usePlaybackRegistry();
  registry = currentRegistry;
  useLayoutEffect(() => currentRegistry.claim(initialClaimPause), [currentRegistry]);
  return null;
};

const renderDrafting = () =>
  render(
    <DraftingUI
      projectItem={mockProjectItem}
      sourceVerses={mockSourceVerses}
      targetVerses={mockTargetVerses}
      userdetail={{ id: 1 } as unknown as User}
    />,
    {
      wrapper: ({ children }) => (
        <PlaybackRegistryProvider>
          <RegistryProbe />
          {children}
        </PlaybackRegistryProvider>
      ),
    }
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockFeatureFlag.mockReturnValue(true);
  ttsRows = [];
  realPlayback = false;
  elements.length = 0;
  synthesize.mockResolvedValue({ audioUrl: 'https://tts.test/verse.ogg' });
  ttsServed = {};
  mockOverrides = {};
  ttsPlaybackEnabled = undefined;
  mockActiveVerseId = 1;
  activeVerseRef = null;
  isBusy = false;
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
  it('renders no controls when the feature is off', () => {
    mockFeatureFlag.mockImplementation(name => name !== 'sourceAudio');

    renderDrafting();

    expect(screen.queryAllByTestId('tts-verse-controls')).toHaveLength(0);
  });

  it('asks the flag service for sourceAudio by name', () => {
    renderDrafting();

    expect(mockFeatureFlag).toHaveBeenCalledWith('sourceAudio');
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

    expect(sourceChapter).toEqual({
      projectId: mockProjectItem.projectId,
      bibleId: mockProjectItem.bibleId,
      bookCode: mockProjectItem.bookCode,
      chapter: mockProjectItem.chapterNumber,
      languageCode: mockProjectItem.sourceLangCode,
    });
    expect(ttsRows).toEqual([
      {
        verseRef: '1',
        verseNumber: 1,
        text: 'In the beginning God created the heaven and the earth.',
        langCode: 'eng',
        audioSource: 'projectSource',
      },
      {
        verseRef: '2',
        verseNumber: 2,
        text: 'And the earth was without form, and void.',
        langCode: 'eng',
        audioSource: 'projectSource',
      },
      {
        verseRef: '3',
        verseNumber: 3,
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
    expect(sourceChapter).toBeNull();
    expect(referenceBibleId).toBe('aq-123');
    expect(ttsRows.slice(0, 2)).toEqual([
      {
        verseRef: '1',
        verseNumber: 1,
        text: 'Hindi verse 1',
        langCode: 'hin',
        audioSource: 'referenceBible',
      },
      {
        verseRef: '2',
        verseNumber: 2,
        text: 'Hindi verse 2',
        langCode: 'hin',
        audioSource: 'referenceBible',
      },
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

describe('DraftingUI — source switch with the real host, queue and registry', () => {
  const play = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Play verse 1' }));
    await waitFor(() => expect(elements.at(-1)?.playCalls.length).toBeGreaterThan(0));
    act(() => elements.at(-1)!.emit('playing'));
  };

  it('skips mount and unrelated renders, then pauses on the old key and resumes after switching back', async () => {
    realPlayback = true;
    renderDrafting();
    expect(initialClaimPause).not.toHaveBeenCalled();
    await openResourceArea();
    expect(initialClaimPause).not.toHaveBeenCalled();
    await play();
    expect(initialClaimPause).toHaveBeenCalledOnce();
    const key = playback.verseKey('1')!;
    elements[0].currentTime = 3.5;
    await userEvent.click(screen.getByRole('button', { name: 'Select Alternative Bible' }));
    expect(playback.status).toBe('idle');
    expect(elements[0].paused).toBe(true);
    expect(registry.getRecord(key)).toMatchObject({ currentTime: 3.5, forceTts: true });
    expect(registry.getRecord(playback.verseKey('1')!)).toBeNull();
    expect(capturedPageKey).toBe('1');
    await userEvent.click(screen.getByRole('button', { name: 'WEB' }));
    expect(playback.verseKey('1')).toBe(key);
    await play();
    expect(elements.at(-1)?.currentTime).toBe(3.5);
    expect(capturedPageKey).toBe('1');
  });

  it('separates equal raw IDs in different domains even with identical text and labels', async () => {
    realPlayback = true;
    renderDrafting();
    await selectReferenceBible();
    await play();
    const aquiferKey = playback.verseKey('1')!;
    const aquiferGroupKey = playback.groupKey(['1', '2'])!;
    elements[0].currentTime = 2;
    await userEvent.click(
      screen.getByRole('button', { name: 'Select Same Text From Other Domain' })
    );
    expect(referenceBibleId).toBe('yv-123');
    expect(playback.status).toBe('idle');
    expect(registry.getRecord(aquiferKey)?.currentTime).toBe(2);
    const youVersionKey = playback.verseKey('1')!;
    expect(youVersionKey).not.toBe(aquiferKey);
    expect(playback.groupKey(['1', '2'])).not.toBe(aquiferGroupKey);
    expect(registry.getRecord(youVersionKey)).toBeNull();
    await play();
    expect(elements.at(-1)?.currentTime).toBe(0);
    const liveElement = elements.at(-1)!;
    liveElement.currentTime = 4;
    await userEvent.click(screen.getByRole('button', { name: 'Rename Selected Bible' }));
    expect(playback.status).toBe('playing');
    expect(liveElement.paused).toBe(false);
    expect(playback.verseKey('1')).toBe(youVersionKey);
    await userEvent.click(screen.getByRole('button', { name: 'Select Alternative Bible' }));
    expect(registry.getRecord(youVersionKey)?.currentTime).toBe(4);
    await play();
    expect(elements.at(-1)?.currentTime).toBe(2);
  });

  it('a request failure reports failure but does not disable visible online controls', async () => {
    realPlayback = true;
    synthesize.mockRejectedValue(new Error('transient failure'));
    renderDrafting();
    await userEvent.click(screen.getByRole('button', { name: 'Play verse 1' }));
    await waitFor(() => expect(playback.status).toBe('idle'));
    expect(synthesize).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play verse 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Play from verse 1' })).toBeEnabled();
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

  it('offers a distinct queue-wide Pause while playback is live', async () => {
    isBusy = true;
    activeVerseRef = '1';
    renderDrafting();
    const pauses = screen.getAllByRole('button', { name: 'Pause playback' });
    expect(pauses).toHaveLength(3);
    await userEvent.click(pauses[2]);
    expect(pausePlayback).toHaveBeenCalledOnce();
    expect(stopPlayback).not.toHaveBeenCalled();
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
    mockFeatureFlag.mockImplementation(name => name !== 'sourceAudio');

    renderDrafting();

    await userEvent.keyboard('{Alt>}p{/Alt}');
    await userEvent.keyboard('{Alt>}s{/Alt}');

    expect(playVerse).not.toHaveBeenCalled();
    expect(stopPlayback).not.toHaveBeenCalled();
  });
});

/**
 * The flag reaches PLAYBACK, not just the controls.
 *
 * React forbids a conditional hook call, so `useSourceTtsPlayback` runs whether
 * the feature is on or off and has to be told which. Before this was wired, a
 * page could keep audio running when the flag went off mid-listen — with
 * no controls and no Alt+S to stop it. Verified in a browser 2026-08-20.
 *
 * The hook's own behaviour under `enabled` is proven in
 * `useSourceTtsPlayback.test.ts`; what only the HOST can prove is that the
 * boolean is actually handed over — the same wiring bug class as the shortcuts
 * that were never mounted.
 */
describe('DraftingUI — the playback gate is wired, not just the controls', () => {
  it('passes the feature flag down to playback', () => {
    renderDrafting();

    expect(ttsPlaybackEnabled).toBe(true);
  });

  it('tells playback the feature is off, so it stops', () => {
    mockFeatureFlag.mockImplementation(name => name !== 'sourceAudio');

    renderDrafting();

    expect(ttsPlaybackEnabled).toBe(false);
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
    expect(playFromGroup).not.toHaveBeenCalled();
    expect(playFromVerse).not.toHaveBeenCalled();
    expect(playVerse).not.toHaveBeenCalled();
  });

  it('offers continuous reading too — the second button runs on past this blob', async () => {
    // Without this button pericope mode has no DISCOVERABLE way to read on:
    // Alt+Shift+P still works but is advertised only on controls that do not
    // render here.
    enterPericopeMode();

    renderDrafting();

    await userEvent.click(screen.getByRole('button', { name: 'Play from pericope 1:1-2' }));

    expect(playFromGroup).toHaveBeenCalledWith(['1', '2']);
    expect(playGroup).not.toHaveBeenCalled();
  });

  it('gives every pericope both play actions', () => {
    enterPericopeMode();

    renderDrafting();

    expect(screen.getAllByRole('button', { name: /^Play pericope/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Play from pericope/ })).toHaveLength(2);
  });

  it('marks the group that contains the playing verse, and only that group', () => {
    enterPericopeMode();
    activeVerseRef = '2'; // verse 2 lives in the first group

    renderDrafting();

    const speaking = screen.getAllByTestId('tts-active-group');
    expect(speaking).toHaveLength(1);
    expect(speaking[0]).toHaveTextContent('And the earth was without form');
    // Assert the marker the LISTENER sees, not merely that a test hook exists:
    // the first cut carried this testid while rendering a 5% wash that dark
    // mode overrode entirely, so the group was "marked" and yet invisible.
    expect(speaking[0].className).toContain('border-l-primary');
    // Verse mode washes the whole ROW, not just its source box; without this
    // the pericope marker was a bare line with no field behind it.
    expect(speaking[0].className).toContain('bg-primary/5');
  });

  it('marks the VERSE being read inside the group, not just the group', () => {
    enterPericopeMode();
    activeVerseRef = '2';

    renderDrafting();

    const spoken = screen.getAllByTestId('tts-active-verse');
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toHaveTextContent('And the earth was without form');
    // Colour only: a weight or padding change here would re-flow the passage
    // every time playback advanced a verse.
    expect(spoken[0].className).not.toContain('font-');
    expect(spoken[0].className).not.toContain('px-');
  });

  it('moves the verse marker as playback advances within one pericope', () => {
    enterPericopeMode();
    activeVerseRef = '1';

    const { rerender } = renderDrafting();
    expect(screen.getByTestId('tts-active-verse')).toHaveTextContent('In the beginning');

    activeVerseRef = '2';
    rerender(
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={mockTargetVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
    );

    const spoken = screen.getAllByTestId('tts-active-verse');
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toHaveTextContent('And the earth was without form');
  });

  it('marks no verse at all while idle', () => {
    enterPericopeMode();

    renderDrafting();

    expect(screen.queryAllByTestId('tts-active-verse')).toHaveLength(0);
  });

  it('leaves every silent group with a transparent rail, so the grid never shifts', () => {
    enterPericopeMode();
    activeVerseRef = '2';

    renderDrafting();

    const silent = screen
      .getAllByText(/And God said, Let there be light/)
      .map(node => node.closest('[style*="grid-template-columns"]'))
      .find(Boolean);
    expect(silent?.className).toContain('border-l-transparent');
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
    // A playing row, so every marker below WOULD render if the flag were on.
    // Without this the assertions pass on an idle page and prove nothing —
    // which is how the invisible pericope marker got shipped in the first place.
    activeVerseRef = '1';
    mockFeatureFlag.mockImplementation((name: string) => name !== 'sourceAudio');

    renderDrafting();

    expect(screen.queryAllByTestId('tts-group-controls')).toHaveLength(0);
    expect(screen.queryAllByTestId('tts-active-group')).toHaveLength(0);
    // G3a option (a): the per-verse marker is a THIRD surface, added after the
    // group ones, and it renders off `activeVerseRef` rather than off the grid
    // props — so it needs its own assertion or it could outlive the flag.
    expect(screen.queryAllByTestId('tts-active-verse')).toHaveLength(0);
  });
});

/**
 * The verification tint (§9.2) — an affordance for whoever is deploying, not a
 * product feature.
 *
 * An artifact store that serves and one that silently regenerates every listen
 * sound IDENTICAL; only the bill differs. Since `generate` names the compressed
 * object directly when one exists (§7.1, amended 2026-08-20), the container is
 * readable off the clip URL, so the wash can carry it for free.
 *
 * `wav` deliberately keeps the ORDINARY blue wash: the streaming case is the
 * normal one and should look normal. Only a clip that came from the bucket
 * departs from it, which makes verification one clear observation — play a
 * verse twice, and the second time it should turn purple.
 */
describe('DraftingUI — the serving tint', () => {
  it('keeps the ordinary wash for a clip generated on this listen', () => {
    mockOverrides = { sourceAudio: true };
    activeVerseRef = '1';
    ttsServed = { '1': 'wav' };

    renderDrafting();

    const row = screen.getByTestId('tts-active-row');
    expect(row.className).toContain('bg-primary/5');
    expect(row.className).not.toContain('purple');
  });

  it('turns the wash purple when the clip came from the bucket', () => {
    mockOverrides = { sourceAudio: true };
    activeVerseRef = '1';
    ttsServed = { '1': 'ogg' };

    renderDrafting();

    const row = screen.getByTestId('tts-active-row');
    expect(row).toHaveAttribute('data-tts-served', 'ogg');
    expect(row.className).toContain('bg-purple-500/20');
    // The ordinary wash is REPLACED, not layered under the diagnostic.
    expect(row.className).not.toContain('bg-primary/5');
  });

  it('uses a darker purple for an mp3 artifact, so the two are told apart', () => {
    mockOverrides = { sourceAudio: true };
    activeVerseRef = '1';
    ttsServed = { '1': 'mp3' };

    renderDrafting();

    const row = screen.getByTestId('tts-active-row');
    expect(row).toHaveAttribute('data-tts-served', 'mp3');
    expect(row.className).toContain('bg-purple-900/20');
  });

  it('shows nothing to a listener who has not forced the flag on', () => {
    // The flag is ON here — merely on is not the same as "someone is verifying".
    activeVerseRef = '1';
    ttsServed = { '1': 'ogg' };

    renderDrafting();

    const row = screen.getByTestId('tts-active-row');
    expect(row).not.toHaveAttribute('data-tts-served');
    expect(row.className).toContain('bg-primary/5');
  });

  it('tints the pericope group by the verse being read inside it', () => {
    enterPericopeMode();
    mockOverrides = { sourceAudio: true };
    activeVerseRef = '1';
    ttsServed = { '1': 'ogg' };

    renderDrafting();

    const group = screen.getByTestId('tts-active-group');
    expect(group).toHaveAttribute('data-tts-served', 'ogg');
    expect(group.className).toContain('bg-purple-500/20');
  });
});
