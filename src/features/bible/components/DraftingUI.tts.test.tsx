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

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftingUI } from '@/features/bible/components/DraftingUI';
import type { PericopeContextChapter } from '@/features/bible/hooks/usePericopeContext';
import type * as TtsFeature from '@/features/tts';
import { PlaybackRegistryProvider, usePlaybackRegistry } from '@/features/tts';
import type * as AudioModule from '@/features/tts/lib/audioElement';
import type * as SourceClient from '@/features/tts/resolver/sourceAudioClient';
import { refreshHideAudio, setHideAudio } from '@/features/tts/settings/hideAudioStore';
import { FakeClipElement } from '@/features/tts/testing/fakeClipElement';
import { windowlessChapter } from '@/features/tts/testing/sourceAudioFixtures';
import { config } from '@/lib/config';
import {
  ChapterAssignmentStatus,
  type ProjectItem,
  type Source,
  type TargetVerse,
  type User,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

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
      (typeof defaultValue === 'string' ? defaultValue : _key).replace(
        /\{\{(\w+)\}\}/g,
        (_m, name: string) => String(options?.[name] ?? '')
      ),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@/features/rte/components/ChapterEditor', () => ({
  ChapterEditor: () => <div data-testid='chapter-editor' />,
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

let mockFullPericopes: typeof mockPericopes | undefined;
let mockContextChapters = new Map<number, PericopeContextChapter>();

vi.mock('@/features/bible/hooks/usePericopeContext', () => ({
  usePericopeContext: () => ({ chapters: mockContextChapters, isLoading: false, isError: false }),
}));

vi.mock('@/features/bible/hooks/usePericope', () => ({
  usePericope: () => ({
    pericopes: mockPericopes,
    fullPericopes: mockFullPericopes,
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
const playedElements = () => elements.filter(element => element.playCalls.length > 0);
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
const restartVerse = vi.fn();

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
        recordedNoticeDialog: null,
        closeRecordedNotice: vi.fn(),
        showRecordedNotice: vi.fn(),
        status: isBusy ? 'playing' : 'idle',
        aiMarkedKeys: new Set<string>(),
        activeVerseRef,
        isBusy,
        isRowPlayable: (verseRef: string) => playable.has(verseRef),
        isRowLoading: () => false,
        servingFor: (verseRef: string) => ttsServed[verseRef],
        playVerse,
        playFromVerse,
        playGroup,
        playGroupAtVerse: vi.fn(),
        playFromGroups: vi.fn(),
        playFromGroup,
        // G3a: the real hook derives this from `activeVerseRef`, so the double
        // does too — a group is speaking iff it contains the playing row.
        isGroupSpeaking: (verseRefs: readonly string[]) =>
          activeVerseRef !== null && verseRefs.includes(activeVerseRef),
        pause: pausePlayback,
        stop: stopPlayback,
        restartVerse,
        restartGroup: vi.fn(),
        verseKey: (ref: string) => (playable.has(ref) ? `verse-${ref}` : null),
        groupKey: () => null,
        seekGroup: vi.fn(),
        groupView: refs => ({
          key: refs.some(ref => playable.has(ref)) ? `group-${refs.join(',')}` : null,
          isLive: isBusy && activeVerseRef !== null && refs.includes(activeVerseRef),
          staticAi: false,
          dynamicAi: false,
          segments: options.rows
            .filter(row => refs.includes(row.verseRef) && playable.has(row.verseRef))
            .map(row => ({
              verseRef: row.verseRef,
              text: row.text ?? '',
              durationSeconds: null,
              epoch: null,
            })),
          currentIndex: Math.max(0, refs.indexOf(activeVerseRef ?? '')),
          currentTime: 0,
        }),
      };
    },
  };
});

// Panel 2 is missing verse 3 on purpose.
vi.mock('@/features/resources/components/ResourcePanel', () => ({
  ResourcePanel: ({
    onBibleVersesChange,
    onBibleSelect,
    onLanguageChange,
    selectedBibleId,
    onBibleLoadingChange,
  }: {
    onBibleVersesChange: (id: string, verses: Array<{ verseNumber: number; text: string }>) => void;
    onBibleSelect: (bible: { id: string; label: string; language: string }) => void;
    onLanguageChange?: (langCode: string) => void;
    selectedBibleId?: string;
    onBibleLoadingChange: (id: string, loading: boolean) => void;
  }) => {
    const select = (id: string, label = 'Hindi Bible') => {
      onBibleSelect({ id, label, language: 'hin' });
      onLanguageChange?.('hin');
      onBibleLoadingChange(id, false);
      onBibleVersesChange(id, [
        { verseNumber: 1, text: 'Hindi verse 1' },
        { verseNumber: 2, text: 'Hindi verse 2' },
      ]);
    };
    return (
      <div data-testid='mock-resource-panel'>
        <button onClick={() => select('aq-123')}>Select Alternative Bible</button>
        <button onClick={() => select('yv-123')}>Select Same Text From Other Domain</button>
        <button onClick={() => select(selectedBibleId ?? 'aq-123', 'Renamed Bible')}>
          Rename Selected Bible
        </button>
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
  // Carried on the assignment: a cleared Bible is the ordinary case, and the
  // audio fence reads it from here rather than from an audio provider.
  ttsLicenseStatus: 'allowed',
  licenseNotice: 'World English Bible. Public domain.',
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

const renderDrafting = (
  projectItem: ProjectItem = mockProjectItem,
  readOnly = false,
  sourceVerses: Source[] = mockSourceVerses
) =>
  render(
    <DraftingUI
      projectItem={projectItem}
      readOnly={readOnly}
      sourceVerses={sourceVerses}
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

const initialRteFlag = config.features.rtePericope;
afterEach(() => {
  config.features.rtePericope = initialRteFlag;
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
  refreshHideAudio();
  setHideAudio(false);
  useAppStore.setState({ displayMode: 'verse' });
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
  mockFullPericopes = undefined;
  mockContextChapters = new Map();
  mockReferenceChapters.clear();
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

  it('removes every control and unregisters shortcuts as soon as audio is hidden', async () => {
    renderDrafting();
    expect(screen.getAllByTestId('tts-verse-controls')).toHaveLength(3);

    act(() => setHideAudio(true));

    expect(screen.queryAllByTestId('tts-verse-controls')).toHaveLength(0);
    await userEvent.keyboard('{Alt>}p{/Alt}');
    expect(playVerse).not.toHaveBeenCalled();
    expect(ttsPlaybackEnabled).toBe(false);
  });

  it('keeps hidden controls absent offline, then shows disabled controls when unhidden', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    setHideAudio(true);
    renderDrafting();
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.queryAllByTestId('tts-verse-controls')).toHaveLength(0);

    act(() => setHideAudio(false));
    const primaries = screen.getAllByRole('button', { name: /^Play verse/ });
    expect(primaries).toHaveLength(3);
    for (const primary of primaries) expect(primary).toHaveAttribute('aria-disabled', 'true');
  });
});

// ── Controls: panel-aware text and language (T17/T18, §5.1) ─────────────────

describe('DraftingUI — panel-aware TTS rows', () => {
  it('panel 1 reads the project source text in the project source language', () => {
    renderDrafting();

    expect(sourceChapter).toMatchObject({
      projectId: mockProjectItem.projectId,
      bibleId: mockProjectItem.bibleId,
      bookCode: mockProjectItem.bookCode,
      chapter: mockProjectItem.chapterNumber,
      languageCode: mockProjectItem.sourceLangCode,
    });
    expect(ttsRows).toMatchObject([
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
    expect(sourceChapter).toMatchObject({
      role: 'referenceBible',
      textBibleKey: 'aq-123',
      languageCode: 'hin',
    });
    expect(referenceBibleId).toBe('aq-123');
    expect(ttsRows.slice(0, 2)).toMatchObject([
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
    expect(screen.getByRole('button', { name: 'Play verse 3' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Restart verse 3' })).toBeDisabled();
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
    await userEvent.click(screen.getByRole('tab', { name: 'WEB' }));
    expect(playback.verseKey('1')).toBe(key);
    await play();
    expect(elements.at(-1)?.currentTime).toBe(3.5);
    expect(capturedPageKey).toBe('1');
  });

  it('hides during playback, records the sounding verse, and restores resumable controls', async () => {
    realPlayback = true;
    renderDrafting();
    await play();
    const key = playback.verseKey('1')!;
    const element = elements.at(-1)!;
    element.currentTime = 4.25;

    act(() => setHideAudio(true));

    expect(element.paused).toBe(true);
    expect(playback.status).toBe('idle');
    expect(registry.getRecord(key)).toMatchObject({
      verseRef: '1',
      currentTime: 4.25,
    });
    expect(screen.queryAllByTestId('tts-verse-controls')).toHaveLength(0);

    act(() => setHideAudio(false));
    const primary = screen.getByRole('button', { name: 'Play verse 1' });
    expect(primary).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart verse 1' })).toBeEnabled();
    const priorElementCount = elements.length;
    await userEvent.click(primary);
    await waitFor(() => expect(elements.length).toBeGreaterThan(priorElementCount));
    expect(elements.at(-1)?.playCalls.length).toBeGreaterThan(0);
    expect(elements.at(-1)?.currentTime).toBe(4.25);
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

  it('turns a barred verse into a pressable control that explains itself, and never synthesizes', async () => {
    realPlayback = true;
    // A Bible nobody cleared, with no recording to fall back on: the one case
    // where the fence has to take the audio away entirely.
    renderDrafting({ ...mockProjectItem, ttsLicenseStatus: 'unknown' });
    const play = () => screen.getByRole('button', { name: 'Play verse 1' });
    await userEvent.click(play());
    await waitFor(() => expect(play()).toHaveAttribute('aria-disabled', 'true'));
    expect(synthesize).not.toHaveBeenCalled();
    // Pressable, not inert: pressing again says why rather than doing nothing.
    await userEvent.click(play());
    expect(toastError).toHaveBeenCalledWith('Text-to-speech has not been cleared for this Bible.');
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('a request failure reports failure but does not disable visible online controls', async () => {
    realPlayback = true;
    synthesize.mockRejectedValue(new Error('transient failure'));
    renderDrafting();
    await userEvent.click(screen.getByRole('button', { name: 'Play verse 1' }));
    await waitFor(() => expect(playback.status).toBe('idle'));
    expect(synthesize).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play verse 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Play verse 1' })).not.toHaveAttribute(
      'aria-disabled'
    );
  });
});

// ── Queue actions and highlight (§5.3) ──────────────────────────────────────

describe('DraftingUI — playback actions and highlight', () => {
  it('routes Play and Restart to the clicked verse, with no play-from-here button', async () => {
    renderDrafting();

    await userEvent.click(screen.getByRole('button', { name: 'Play verse 2' }));
    expect(playVerse).toHaveBeenCalledWith('2');

    act(() => registry.setLive('verse-3'));
    await userEvent.click(screen.getByRole('button', { name: 'Restart verse 3' }));
    expect(restartVerse).toHaveBeenCalledWith('3');
    expect(screen.queryByRole('button', { name: /^Play from verse/ })).not.toBeInTheDocument();
    expect(playFromVerse).not.toHaveBeenCalled();
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

  it('shows Pause on the live primary only, routing through the host toggle without resetting', async () => {
    isBusy = true;
    activeVerseRef = '1';
    renderDrafting();
    act(() => registry.setLive('verse-1'));
    const pauses = screen.getAllByRole('button', { name: /^Pause verse/ });
    expect(pauses).toHaveLength(1);
    await userEvent.click(pauses[0]);
    expect(playVerse).toHaveBeenCalledWith('1');
    expect(stopPlayback).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Stop playback' })).not.toBeInTheDocument();
  });

  it('keeps hover controls mounted and focus-revealable, with no slider in verse mode', () => {
    renderDrafting();
    const button = screen.getByRole('button', { name: 'Play verse 2' });
    const reveal = screen.getAllByTestId('tts-verse-controls')[1].parentElement!;
    expect(reveal).toHaveClass(
      'opacity-0',
      'left-8',
      'top-1/2',
      '-translate-y-1/2',
      'group-hover/audio:opacity-100',
      'has-[:focus-visible]:opacity-100',
      '[@media(hover:none)]:opacity-100'
    );
    expect(reveal.parentElement).toHaveClass('group/audio', 'relative');
    button.focus();
    expect(button).toHaveFocus();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('never starts the real queue on mount or playable data arrival', async () => {
    realPlayback = true;
    renderDrafting();
    await selectReferenceBible();
    expect(synthesize).not.toHaveBeenCalled();
    expect(elements).toHaveLength(0);
    expect(playback.status).toBe('idle');
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
  it('pericope Alt+P seeks the caret inside the FULL player and shares its pointer resume and Restart', async () => {
    enterPericopeMode();
    realPlayback = true;
    mockActiveVerseId = 2;
    renderDrafting();
    const key = playback.groupKey(['1', '2'])!;
    const bar = screen.getAllByRole('slider')[0];
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    expect(playback.activeVerseRef).toBe('2');
    expect(registry.isLive(key)).toBe(true);
    expect(registry.isLive(playback.verseKey('2')!)).toBe(false);
    expect(playback.groupView(['1', '2']).segments.map(item => item.verseRef)).toEqual(['1', '2']);
    expect(playback.groupView(['1', '2']).currentIndex).toBe(1);
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    act(() => {
      elements[0].currentTime = 2.5;
      elements[0].emit('playing');
    });
    await userEvent.keyboard('{Alt>}s{/Alt}');
    expect(registry.getRecord(key)).toMatchObject({
      itemIndex: 1,
      verseRef: '2',
      currentTime: 2.5,
    });
    expect(registry.getRecord(playback.verseKey('2')!)).toBeNull();
    expect(playback.groupView(['1', '2']).currentIndex).toBe(1);
    // Pointer Play resumes the KEYBOARD position, in the same player.
    await userEvent.click(screen.getByRole('button', { name: 'Play pericope 1:1-2' }));
    await waitFor(() => expect(elements[1]?.playCalls.length).toBeGreaterThan(0));
    expect(elements[1].currentTime).toBe(2.5);
    await userEvent.keyboard('{Alt>}p{/Alt}');
    expect(playback.status).toBe('idle');
    // Keyboard Play resumes too, rather than repeatedly re-seeking the verse start.
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(elements[2]?.playCalls.length).toBeGreaterThan(0));
    expect(elements[2].currentTime).toBe(2.5);
    await userEvent.keyboard('{Alt>}s{/Alt}');
    await userEvent.keyboard('{Alt>}r{/Alt}');
    expect(registry.getRecord(key)).toBeNull();
    expect(playback.groupView(['1', '2']).currentIndex).toBe(0);
    expect(elements).toHaveLength(3);
  });

  it('pericope Alt+P continues to the pericope end, not just the caret verse or the page', async () => {
    enterPericopeMode();
    realPlayback = true;
    renderDrafting();
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    act(() => elements[0].emit('ended'));
    await waitFor(() => expect(elements[1]?.playCalls.length).toBeGreaterThan(0));
    expect(playback.activeVerseRef).toBe('2');
    expect(registry.isLive(playback.groupKey(['1', '2'])!)).toBe(true);
    act(() => elements[1].emit('ended'));
    expect(playback.status).toBe('idle');
    expect(elements).toHaveLength(2);
  });

  it('continuous pericope reading keeps full group identities, bars and pause records across boundaries', async () => {
    enterPericopeMode();
    realPlayback = true;
    mockActiveVerseId = 2;
    renderDrafting();
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    expect(playback.activeVerseRef).toBe('2');
    expect(registry.isLive(playback.groupKey(['1', '2'])!)).toBe(true);
    expect(playback.groupView(['1', '2']).segments.map(item => item.verseRef)).toEqual(['1', '2']);
    act(() => elements[0].emit('ended'));
    await waitFor(() => expect(elements[1]?.playCalls.length).toBeGreaterThan(0));
    act(() => {
      elements[1].currentTime = 2;
      elements[1].emit('playing');
    });
    expect(playback.activeVerseRef).toBe('3');
    expect(registry.isLive(playback.groupKey(['3'])!)).toBe(true);
    expect(playback.groupView(['1', '2']).segments.map(item => item.verseRef)).toEqual(['1', '2']);
    await userEvent.keyboard('{Alt>}s{/Alt}');
    expect(registry.getRecord(playback.groupKey(['3'])!)).toMatchObject({
      itemIndex: 0,
      verseRef: '3',
      currentTime: 2,
    });
    expect(registry.getRecord(playback.verseKey('3')!)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Play pericope 1:3' }));
    await waitFor(() => expect(elements[2]?.playCalls.length).toBeGreaterThan(0));
    expect(elements[2].currentTime).toBe(2);
  });

  it('a different caret verse seeks in the same paused pericope rather than resuming the old verse', async () => {
    enterPericopeMode();
    realPlayback = true;
    mockActiveVerseId = 2;
    renderDrafting();
    const key = playback.groupKey(['1', '2'])!;
    act(() =>
      registry.setRecord(key, { itemIndex: 0, verseRef: '1', currentTime: 3, forceTts: false })
    );
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    expect(playback.activeVerseRef).toBe('2');
    expect(elements[0].currentTime).toBe(0);
    expect(registry.isLive(key)).toBe(true);
  });

  it.each(['{Alt>}p{/Alt}', '{Alt>}{Shift>}p{/Shift}{/Alt}'])(
    'a reference hole skips the optional caret jump, not the otherwise playable pericope (%s)',
    async chord => {
      enterPericopeMode();
      mockPericopes = [
        {
          pericopeNumber: '1',
          pericopeTitle: null,
          verses: [1, 2, 3].map(verseNumber => ({ chapterNumber: 1, verseNumber })),
        },
      ];
      realPlayback = true;
      mockActiveVerseId = 3;
      renderDrafting();
      await selectReferenceBible();
      await userEvent.keyboard(chord);
      await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
      expect(playback.activeVerseRef).toBe('1');
      expect(registry.isLive(playback.groupKey(['1', '2', '3'])!)).toBe(true);
      expect(playback.groupView(['1', '2', '3']).segments.map(item => item.verseRef)).toEqual([
        '1',
        '2',
      ]);
      expect(toastError).not.toHaveBeenCalled();
    }
  );

  it('pericope offline primary explains while keyboard Restart and direct scrub stay inert', async () => {
    enterPericopeMode();
    realPlayback = true;
    renderDrafting();
    registry.silenceAll();
    const key = playback.groupKey(['1', '2'])!;
    act(() =>
      registry.setRecord(key, { itemIndex: 1, verseRef: '2', currentTime: 3, forceTts: false })
    );
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');
    expect(toastError).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenLastCalledWith("You're offline. Reconnect to play audio.");
    await userEvent.keyboard('{Alt>}r{/Alt}');
    act(() => playback.seekGroup(['1', '2'], '1', 0));
    expect(registry.getRecord(key)?.currentTime).toBe(3);
    expect(synthesize).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(2);
  });

  it('pericope keyboard starts share the pericope impossible guard, not the verse key', async () => {
    enterPericopeMode();
    realPlayback = true;
    mockActiveVerseId = 2;
    renderDrafting();
    act(() => registry.setImpossible(playback.groupKey(['1', '2'])!, 'Pericope unavailable.'));
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');
    expect(toastError).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenLastCalledWith('Pericope unavailable.');
    expect(synthesize).not.toHaveBeenCalled();
    expect(elements).toHaveLength(0);
  });

  it('Alt+S records the sounding verse in a run; Alt+P at that caret resumes its offset', async () => {
    realPlayback = true;
    const h = renderDrafting();
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    act(() => elements[0].emit('ended'));
    await waitFor(() => expect(elements[1]?.playCalls.length).toBeGreaterThan(0));
    act(() => {
      elements[1].currentTime = 2.5;
      elements[1].emit('playing');
    });
    await userEvent.keyboard('{Alt>}s{/Alt}');
    const key = playback.verseKey('2')!;
    expect(registry.getRecord(key)?.currentTime).toBe(2.5);
    expect(registry.getRecord(playback.verseKey('1')!)).toBeNull();
    expect(playback.status).toBe('idle');
    mockActiveVerseId = 2;
    // Cause a normal host render so the keyboard ref observes the new caret.
    h.rerender(
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={mockTargetVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
    );
    const next = elements.length;
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(elements[next]?.playCalls.length).toBeGreaterThan(0));
    expect(elements[next].currentTime).toBe(2.5);
    expect(playback.activeVerseRef).toBe('2');
  });

  it('Alt+P on the sounding verse uses primary Pause, not Stop/reset', async () => {
    realPlayback = true;
    renderDrafting();
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    act(() => {
      elements[0].currentTime = 3;
      elements[0].emit('playing');
    });
    await userEvent.keyboard('{Alt>}p{/Alt}');
    expect(playback.status).toBe('idle');
    expect(registry.getRecord(playback.verseKey('1')!)?.currentTime).toBe(3);
  });

  it('Alt+R reaches a sounding sidebar Restart rather than the caret', async () => {
    renderDrafting();
    const sidebarRestart = vi.fn();
    registry.claim(vi.fn(), sidebarRestart);
    await userEvent.keyboard('{Alt>}r{/Alt}');
    expect(sidebarRestart).toHaveBeenCalledOnce();
    expect(restartVerse).not.toHaveBeenCalled();
  });

  it('Alt+R restarts the sounding bounded pericope from its first verse, not the caret', async () => {
    enterPericopeMode();
    realPlayback = true;
    mockActiveVerseId = 3;
    renderDrafting();
    await userEvent.click(screen.getByRole('button', { name: 'Play pericope 1:1-2' }));
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    act(() => elements[0].emit('ended'));
    await waitFor(() => expect(elements[1]?.playCalls.length).toBeGreaterThan(0));
    act(() => {
      elements[1].currentTime = 2;
      elements[1].emit('playing');
    });
    const next = elements.length;
    await userEvent.keyboard('{Alt>}r{/Alt}');
    await waitFor(() => expect(elements[next]?.playCalls.length).toBeGreaterThan(0));
    expect(playback.activeVerseRef).toBe('1');
    expect(elements[next].currentTime).toBe(0);
    expect(registry.isLive(playback.groupKey(['1', '2'])!)).toBe(true);
    expect(registry.getRecord(playback.groupKey(['1', '2'])!)).toBeNull();
  });

  it('Alt+R in a verse-key run restarts the sounding verse, not the whole run', async () => {
    realPlayback = true;
    renderDrafting();
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    act(() => elements[0].emit('ended'));
    await waitFor(() => expect(elements[1]?.playCalls.length).toBeGreaterThan(0));
    act(() => {
      elements[1].currentTime = 2;
      elements[1].emit('playing');
    });
    const next = elements.length;
    await userEvent.keyboard('{Alt>}r{/Alt}');
    await waitFor(() => expect(elements[next]?.playCalls.length).toBeGreaterThan(0));
    expect(elements[next].currentTime).toBe(0);
    expect(playback.activeVerseRef).toBe('2');
    act(() => elements[next].emit('ended'));
    expect(playback.status).toBe('idle');
  });

  it('silent Alt+R clears only the active verse record; disabled Restart does nothing', async () => {
    realPlayback = true;
    renderDrafting();
    registry.silenceAll();
    await userEvent.keyboard('{Alt>}r{/Alt}');
    expect(synthesize).not.toHaveBeenCalled();
    const record = { itemIndex: 0, verseRef: '1', currentTime: 3, forceTts: true };
    act(() => {
      registry.setRecord(playback.verseKey('1')!, record);
      registry.setRecord(playback.verseKey('2')!, { ...record, verseRef: '2' });
    });
    await userEvent.keyboard('{Alt>}r{/Alt}');
    expect(registry.getRecord(playback.verseKey('1')!)).toBeNull();
    expect(registry.getRecord(playback.verseKey('2')!)?.currentTime).toBe(3);
    expect(playback.status).toBe('idle');
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('Alt+P and play-from-here share the impossible button reason and start nothing', async () => {
    realPlayback = true;
    renderDrafting();
    act(() => registry.setImpossible(playback.verseKey('1')!, 'Licence forbids audio.'));
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');
    await userEvent.click(screen.getByRole('button', { name: 'Play verse 1' }));
    expect(toastError).toHaveBeenCalledTimes(3);
    expect(toastError.mock.calls.every(([reason]) => reason === 'Licence forbids audio.')).toBe(
      true
    );
    expect(synthesize).not.toHaveBeenCalled();
    expect(elements).toHaveLength(0);
  });

  it('offline shortcuts explain primary, keep Restart inert, and recover on the same mount', async () => {
    realPlayback = true;
    renderDrafting();
    registry.silenceAll();
    const key = playback.verseKey('1')!;
    act(() =>
      registry.setRecord(key, { itemIndex: 0, verseRef: '1', currentTime: 3, forceTts: false })
    );
    const online = vi.spyOn(navigator, 'onLine', 'get');
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');
    expect(toastError).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenLastCalledWith("You're offline. Reconnect to play audio.");
    await userEvent.keyboard('{Alt>}r{/Alt}');
    expect(toastError).toHaveBeenCalledTimes(2);
    expect(registry.getRecord(key)?.currentTime).toBe(3);
    expect(synthesize).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    expect(elements[0].currentTime).toBe(3);
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await userEvent.keyboard('{Alt>}r{/Alt}');
    expect(elements).toHaveLength(1);
    expect(registry.isLive(key)).toBe(true);
    await userEvent.keyboard('{Alt>}s{/Alt}');
    expect(playback.status).toBe('idle');
    expect(registry.getRecord(key)?.currentTime).toBe(3);
  });

  it.each([false, true])(
    'chapter view has one visible player on %s read-only route',
    async readOnly => {
      config.features.rtePericope = true;
      useAppStore.setState({ displayMode: 'chapter' });
      renderDrafting(mockProjectItem, readOnly);
      expect(await screen.findByRole('button', { name: 'Play chapter 1' })).toBeInTheDocument();
      expect(screen.getAllByTestId('tts-group-controls')).toHaveLength(1);
      expect(screen.getAllByRole('slider')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /pericope/i })).not.toBeInTheDocument();
      expect(screen.getByTestId('chapter-editor')).toBeInTheDocument();
      expect(ttsRows.map(row => row.verseRef)).toEqual(['1', '2', '3']);
    }
  );

  it('flag-off Chapter selection adds no chapter player or shortcuts', async () => {
    config.features.rtePericope = false;
    useAppStore.setState({ displayMode: 'chapter' });
    renderDrafting();
    expect(screen.queryByTestId('tts-group-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chapter-source-viewport')).not.toBeInTheDocument();
  });

  it('chapter pointer and four shortcuts share the full group, saved position and Restart', async () => {
    realPlayback = true;
    config.features.rtePericope = true;
    useAppStore.setState({ displayMode: 'chapter' });
    mockActiveVerseId = 2;
    renderDrafting();
    await screen.findByRole('button', { name: 'Play chapter 1' });
    const refs = ['1', '2', '3'];
    const key = playback.groupKey(refs)!;
    const bar = screen.getByRole('slider');

    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    expect(playback.activeVerseRef).toBe('2');
    expect(registry.isLive(key)).toBe(true);
    expect(playback.groupView(refs).segments.map(segment => segment.verseRef)).toEqual(refs);
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Pause chapter 1' })).toBeInTheDocument();

    act(() => {
      elements[0].currentTime = 2.5;
      elements[0].emit('playing');
    });
    await userEvent.keyboard('{Alt>}s{/Alt}');
    expect(registry.getRecord(key)).toMatchObject({ verseRef: '2', currentTime: 2.5 });
    await userEvent.click(screen.getByRole('button', { name: 'Play chapter 1' }));
    await waitFor(() => expect(playedElements()).toHaveLength(2));
    expect(playedElements()[1].currentTime).toBe(2.5);

    await userEvent.keyboard('{Alt>}r{/Alt}');
    await waitFor(() => expect(playedElements()).toHaveLength(3));
    expect(playback.activeVerseRef).toBe('1');
    await userEvent.keyboard('{Alt>}s{/Alt}');
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');
    await waitFor(() => expect(playedElements()).toHaveLength(4));
    expect(registry.isLive(key)).toBe(true);
    expect(screen.getAllByTestId('tts-group-controls')).toHaveLength(1);
  });

  it('chapter reference holes keep one usable player with independent text and identity', async () => {
    realPlayback = true;
    config.features.rtePericope = true;
    useAppStore.setState({ displayMode: 'chapter' });
    renderDrafting();
    await screen.findByRole('button', { name: 'Play chapter 1' });
    const sourceKey = playback.groupKey(['1', '2', '3']);
    await selectReferenceBible();
    const referenceKey = playback.groupKey(['1', '2', '3']);
    expect(referenceKey).not.toBe(sourceKey);
    expect(referenceBibleId).toBe('aq-123');
    expect(sourceChapter?.role).toBe('referenceBible');
    expect(sourceChapter?.languageCode).toBe('hin');
    expect(ttsRows.map(row => row.text)).toEqual(['Hindi verse 1', 'Hindi verse 2', undefined]);
    expect(playback.groupView(['1', '2', '3']).segments.map(segment => segment.verseRef)).toEqual([
      '1',
      '2',
    ]);
    expect(screen.getAllByTestId('tts-group-controls')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Play chapter 1' }));
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    expect(registry.isLive(referenceKey!)).toBe(true);
  });

  it('switching source tabs pauses the old chapter and preserves its own record', async () => {
    realPlayback = true;
    config.features.rtePericope = true;
    useAppStore.setState({ displayMode: 'chapter' });
    renderDrafting();
    await userEvent.click(await screen.findByRole('button', { name: 'Play chapter 1' }));
    await waitFor(() => expect(playedElements()).toHaveLength(1));
    const sourceKey = playback.groupKey(['1', '2', '3'])!;
    act(() => {
      playedElements()[0].currentTime = 1.25;
      playedElements()[0].emit('playing');
    });
    await selectReferenceBible();
    const referenceKey = playback.groupKey(['1', '2', '3'])!;
    expect(referenceKey).not.toBe(sourceKey);
    expect(registry.isLive(sourceKey)).toBe(false);
    expect(registry.getRecord(sourceKey)?.currentTime).toBe(1.25);
    expect(registry.getRecord(referenceKey)).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'WEB' }));
    expect(playback.groupKey(['1', '2', '3'])).toBe(sourceKey);
    expect(screen.getByRole('button', { name: 'Play chapter 1' })).toBeInTheDocument();
  });

  it('chapter scrub parks the selected verse in the same player for keyboard resume', async () => {
    realPlayback = true;
    config.features.rtePericope = true;
    useAppStore.setState({ displayMode: 'chapter' });
    renderDrafting();
    await screen.findByRole('button', { name: 'Play chapter 1' });
    const key = playback.groupKey(['1', '2', '3'])!;
    const bar = screen.getByRole('slider');
    fireEvent.keyDown(bar, { key: 'End' });
    fireEvent.keyUp(bar, { key: 'End' });
    expect(registry.getRecord(key)).toMatchObject({ verseRef: '3', pendingFraction: 0 });
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(playedElements()).toHaveLength(1));
    expect(playback.activeVerseRef).toBe('3');
    expect(registry.isLive(key)).toBe(true);
  });

  it('chapter offline and impossible states guard pointer and keyboard through the same key', async () => {
    realPlayback = true;
    config.features.rtePericope = true;
    useAppStore.setState({ displayMode: 'chapter' });
    renderDrafting();
    await screen.findByRole('button', { name: 'Play chapter 1' });
    const key = playback.groupKey(['1', '2', '3'])!;
    act(() => registry.setImpossible(key, 'Chapter unavailable.'));
    await userEvent.keyboard('{Alt>}p{/Alt}');
    expect(toastError).toHaveBeenLastCalledWith('Chapter unavailable.');
    expect(screen.getByRole('button', { name: 'Play chapter 1' })).toBeInTheDocument();
    act(() => registry.setImpossible(key, null));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await userEvent.keyboard('{Alt>}{Shift>}p{/Shift}{/Alt}');
    expect(toastError).toHaveBeenLastCalledWith("You're offline. Reconnect to play audio.");
    expect(playedElements()).toHaveLength(0);
  });

  it('chapter playback highlights and scrolls a source verse without moving the target', async () => {
    realPlayback = true;
    config.features.rtePericope = true;
    useAppStore.setState({ displayMode: 'chapter' });
    mockActiveVerseId = 3;
    renderDrafting();
    await screen.findByRole('button', { name: 'Play chapter 1' });
    const viewport = screen.getByTestId('chapter-source-viewport');
    const target = screen.getByTestId('chapter-editor');
    const sourceVerse = within(viewport).getByText(
      'And God said, Let there be light.'
    ).parentElement!;
    const scroll = vi.fn();
    sourceVerse.scrollIntoView = scroll;
    vi.spyOn(sourceVerse, 'getBoundingClientRect').mockReturnValue({
      top: 120,
      bottom: 140,
    } as DOMRect);
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 100,
    } as DOMRect);

    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    expect(screen.getByTestId('tts-active-chapter-verse')).toBe(sourceVerse);
    expect(target.contains(sourceVerse)).toBe(false);
    expect(within(viewport).queryByTestId('tts-group-controls')).not.toBeInTheDocument();
  });

  it('hiding audio silences the chapter and showing it restores the saved group position', async () => {
    realPlayback = true;
    config.features.rtePericope = true;
    useAppStore.setState({ displayMode: 'chapter' });
    renderDrafting();
    await userEvent.click(await screen.findByRole('button', { name: 'Play chapter 1' }));
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    const key = playback.groupKey(['1', '2', '3'])!;
    act(() => {
      elements[0].currentTime = 1.75;
      elements[0].emit('playing');
      setHideAudio(true);
    });
    expect(screen.queryByTestId('tts-group-controls')).not.toBeInTheDocument();
    expect(registry.isLive(key)).toBe(false);
    expect(registry.getRecord(key)?.currentTime).toBe(1.75);
    act(() => setHideAudio(false));
    expect(await screen.findByRole('button', { name: 'Play chapter 1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play chapter 1' }));
    await waitFor(() => expect(playedElements()).toHaveLength(2));
    expect(playedElements()[1].currentTime).toBe(1.75);
  });

  it('pauses the old run before changing from chapter to verse controls', async () => {
    realPlayback = true;
    config.features.rtePericope = true;
    useAppStore.setState({ displayMode: 'chapter' });
    renderDrafting();
    await userEvent.click(await screen.findByRole('button', { name: 'Play chapter 1' }));
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    const key = playback.groupKey(['1', '2', '3'])!;
    act(() => useAppStore.setState({ displayMode: 'verse' }));
    expect(screen.queryByTestId('tts-group-controls')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('tts-verse-controls')).toHaveLength(3);
    expect(registry.isLive(key)).toBe(false);
    expect(registry.getRecord(key)).not.toBeNull();
    expect(elements[0].paused).toBe(true);
  });

  it('silences verse playback while the chapter chunk replaces its controls', async () => {
    realPlayback = true;
    config.features.rtePericope = true;
    renderDrafting();
    await userEvent.click(screen.getByRole('button', { name: 'Play verse 1' }));
    await waitFor(() => expect(playedElements()).toHaveLength(1));
    const verseKey = playback.verseKey('1')!;
    act(() => useAppStore.setState({ displayMode: 'chapter' }));
    expect(registry.isLive(verseKey)).toBe(false);
    expect(playedElements()[0].paused).toBe(true);
    expect(await screen.findByRole('button', { name: 'Play chapter 1' })).toBeInTheDocument();
    expect(screen.getAllByTestId('tts-group-controls')).toHaveLength(1);
  });

  it('keeps the chapter bar outside a long source document viewport', async () => {
    config.features.rtePericope = true;
    useAppStore.setState({ displayMode: 'chapter' });
    const longChapter = Array.from({ length: 176 }, (_, index) => ({
      id: index + 1,
      verseNumber: index + 1,
      text: `Psalm 119 verse ${index + 1}`,
    }));
    renderDrafting({ ...mockProjectItem, totalVerses: 176 }, true, longChapter);
    const player = await screen.findByTestId('tts-group-controls');
    const viewport = screen.getByTestId('chapter-source-viewport');
    expect(within(viewport).getByText('Psalm 119 verse 176')).toBeInTheDocument();
    expect(viewport.contains(player)).toBe(false);
    expect(ttsRows).toHaveLength(176);
    expect(screen.getAllByTestId('audio-segment-boundary')).toHaveLength(175);
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

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

  it('Alt+S pauses a sidebar claimant app-wide and leaves the claim list empty', async () => {
    renderDrafting();
    const sidebarPause = vi.fn();
    registry.claim(sidebarPause);
    await userEvent.keyboard('{Alt>}s{/Alt}');
    expect(sidebarPause).toHaveBeenCalledOnce();
    registry.silenceAll();
    expect(sidebarPause).toHaveBeenCalledOnce();
    expect(registry.restartLive()).toBe(false);
    expect(stopPlayback).not.toHaveBeenCalled();
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
  it('lights each pericope in turn during a real verse-key run and pauses the sounding verse', async () => {
    enterPericopeMode();
    realPlayback = true;
    renderDrafting();
    expect(elements).toHaveLength(0);
    await act(async () => playback.playFromVerse('2'));
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    act(() => elements[0].emit('playing'));
    expect(screen.getByRole('button', { name: 'Pause pericope 1:1-2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play pericope 1:3' })).toBeInTheDocument();
    await act(async () => {
      elements[0].currentTime = 6;
      elements[0].emit('ended');
    });
    await waitFor(() => expect(elements[1]?.playCalls.length).toBeGreaterThan(0));
    act(() => {
      elements[1].currentTime = 2;
      elements[1].emit('playing');
      elements[1].emit('timeupdate');
    });
    expect(screen.getByRole('button', { name: 'Play pericope 1:1-2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pause pericope 1:3' }));
    expect(playback.status).toBe('idle');
    expect(registry.getRecord(playback.verseKey('3')!)?.currentTime).toBe(2);
    expect(registry.getRecord(playback.groupKey(['3'])!)).toBeNull();
  });

  it('latches every windowless barred pericope without an AI badge and shares the reason with keyboard starts', async () => {
    enterPericopeMode();
    realPlayback = true;
    renderDrafting({ ...mockProjectItem, ttsLicenseStatus: 'unknown' });
    await userEvent.click(screen.getByRole('button', { name: 'Play pericope 1:1-2' }));
    for (const label of ['1:1-2', '1:3']) {
      await waitFor(() =>
        expect(screen.getByRole('button', { name: `Play pericope ${label}` })).toHaveAttribute(
          'aria-disabled',
          'true'
        )
      );
      expect(screen.getByRole('button', { name: `Restart pericope ${label}` })).toBeDisabled();
    }
    for (const refs of [['1', '2'], ['3']]) {
      const key = playback.groupKey(refs)!;
      expect(registry.getSnapshot(key).impossibleReason).toBe(
        'Text-to-speech has not been cleared for this Bible.'
      );
      expect(playback.groupView(refs).staticAi).toBe(false);
    }
    expect(document.querySelector('.lucide-sparkles')).toBeNull();
    toastError.mockClear();
    act(() => playback.playGroupAtVerse(['3'], '3'));
    expect(toastError).toHaveBeenCalledWith('Text-to-speech has not been cleared for this Bible.');
    expect(synthesize).not.toHaveBeenCalled();
    expect(elements).toHaveLength(0);
  });

  it('retains a bounded pericope position and resumes without confusing seconds and fractions', async () => {
    enterPericopeMode();
    realPlayback = true;
    renderDrafting();
    await userEvent.click(screen.getByRole('button', { name: 'Play pericope 1:1-2' }));
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    act(() => {
      elements[0].currentTime = 0.5;
      elements[0].emit('playing');
      elements[0].emit('timeupdate');
    });
    expect(playback.groupView(['1', '2']).currentTime).toBe(0.5);
    await userEvent.click(screen.getByRole('button', { name: 'Pause pericope 1:1-2' }));
    expect(registry.getRecord(playback.groupKey(['1', '2'])!)?.currentTime).toBe(0.5);
    expect(playback.groupView(['1', '2']).currentTime).toBe(0.5);
    const priorCount = elements.length;
    await userEvent.click(screen.getByRole('button', { name: 'Play pericope 1:1-2' }));
    await waitFor(() => expect(elements[priorCount]?.playCalls.length).toBeGreaterThan(0));
    expect(elements[priorCount].currentTime).toBe(0.5);
  });

  it.each([
    { role: 'project source', selectReference: false },
    { role: 'reference Bible', selectReference: true },
  ])(
    'Hide Audio pauses the full $role pericope on its group key and restores its offset',
    async ({ selectReference }) => {
      enterPericopeMode();
      realPlayback = true;
      renderDrafting();
      if (selectReference) await selectReferenceBible();
      expect(screen.getAllByTestId('tts-group-controls')).toHaveLength(2);

      const groupKey = playback.groupKey(['1', '2'])!;
      const verseKey = playback.verseKey('1')!;
      await userEvent.click(screen.getByRole('button', { name: 'Play pericope 1:1-2' }));
      await waitFor(() => expect(elements.some(item => item.playCalls.length > 0)).toBe(true));
      const sounding = elements.find(item => item.playCalls.length > 0)!;
      act(() => {
        sounding.currentTime = 2.75;
        sounding.emit('playing');
        sounding.emit('timeupdate');
      });

      act(() => setHideAudio(true));

      expect(sounding.paused).toBe(true);
      expect(playback.status).toBe('idle');
      expect(registry.getRecord(groupKey)).toMatchObject({
        itemIndex: 0,
        verseRef: '1',
        currentTime: 2.75,
      });
      expect(registry.getRecord(verseKey)).toBeNull();
      expect(screen.queryAllByTestId('tts-group-controls')).toHaveLength(0);

      act(() => setHideAudio(false));
      const play = screen.getByRole('button', { name: 'Play pericope 1:1-2' });
      expect(screen.getByRole('button', { name: 'Restart pericope 1:1-2' })).toBeEnabled();
      const priorCount = elements.length;
      await userEvent.click(play);
      await waitFor(() =>
        expect(elements.slice(priorCount).some(item => item.playCalls.length > 0)).toBe(true)
      );
      const resumed = elements.slice(priorCount).find(item => item.playCalls.length > 0)!;
      expect(resumed.currentTime).toBe(2.75);
    }
  );

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

  it('mounts the player beside the source reference, outside the clickable card and never in the target', () => {
    enterPericopeMode();
    renderDrafting();
    for (const source of screen.getAllByTestId('pericope-source-column')) {
      const player = within(source).getByTestId('tts-group-controls');
      expect(within(player).getByRole('slider')).toBeInTheDocument();
      expect(player.parentElement?.querySelector('h4')).toBeInTheDocument();
      expect(player.closest('[role="button"]')).toBeNull();
      expect(
        within(source.nextElementSibling as HTMLElement).queryByRole('slider')
      ).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /^Play from pericope/ })).not.toBeInTheDocument();
  });

  it('gives every pericope primary and Restart controls plus its own bar', () => {
    enterPericopeMode();

    renderDrafting();

    expect(screen.getAllByRole('button', { name: /^Play pericope/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Restart pericope/ })).toHaveLength(2);
    expect(screen.getAllByRole('slider')).toHaveLength(2);
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

  it('offers Pause only on the live group, without a visible Stop or play-from-here button', () => {
    enterPericopeMode();
    isBusy = true;
    activeVerseRef = '1';

    renderDrafting();

    expect(screen.getAllByRole('button', { name: /^Pause pericope/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Play pericope/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Stop playback/ })).not.toBeInTheDocument();
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

vi.mock('@/features/tts/resolver/providerFacts', () => ({ useProviderFacts: () => undefined }));
const mockReferenceChapters = new Map<
  number,
  { texts: Map<number, string>; loading: boolean; error: boolean }
>();
vi.mock('@/features/resources/hooks/useReferenceChapterTexts', () => ({
  useReferenceChapterTexts: () => mockReferenceChapters,
}));
// Provider transport/display has its own suite; this host suite exercises audio geometry.
vi.mock('@/features/bible/components/PericopeReferenceVerses', () => ({
  PericopeReferenceVerses: () => null,
}));

describe('DraftingUI — full cross-chapter audio scope', () => {
  const crossing = () => {
    realPlayback = true;
    mockIsPericopeMode = true;
    mockActiveVerseId = 3;
    mockPericopes = [
      {
        pericopeNumber: 'crossing',
        pericopeTitle: null,
        verses: [{ chapterNumber: 1, verseNumber: 3 }],
      },
    ];
    mockFullPericopes = [
      {
        ...mockPericopes[0],
        verses: [...mockPericopes[0].verses, { chapterNumber: 2, verseNumber: 1 }],
      },
    ];
    mockContextChapters.set(2, {
      sourceVerses: [{ id: 201, verseNumber: 1, text: 'Adjacent chapter source text' }],
      targetVerses: [],
      isLoading: false,
      isError: false,
      sourceIsLoading: false,
      sourceIsError: false,
    });
  };

  it('mouse and keyboard share the complete visible range, bar and chapter-qualified identity', async () => {
    crossing();
    renderDrafting();
    expect(screen.getByText('Adjacent chapter source text')).toBeInTheDocument();
    expect(ttsRows.map(row => [row.verseRef, row.chapterNumber, row.text])).toEqual([
      ['3', 1, 'And God said, Let there be light.'],
      ['2:1', 2, 'Adjacent chapter source text'],
    ]);
    const refs = ['3', '2:1'];
    const key = playback.groupKey(refs);
    await userEvent.click(screen.getByRole('button', { name: 'Play pericope 1:3–2:1' }));
    await waitFor(() => expect(elements[0]?.playCalls.length).toBeGreaterThan(0));
    act(() => elements[0].emit('playing'));
    expect(playback.groupView(refs).segments.map(item => item.verseRef)).toEqual(refs);
    await userEvent.keyboard('{Alt>}s{/Alt}');
    await userEvent.keyboard('{Alt>}p{/Alt}');
    await waitFor(() => expect(playback.status).not.toBe('idle'));
    expect(playback.groupKey(refs)).toBe(key);
    expect(registry.isLive(key!)).toBe(true);
  });

  it.each(['missing', 'blank'] as const)(
    'does not shorten reference playback when a nonempty adjacent chapter has %s promised text',
    async kind => {
      crossing();
      mockActiveVerseId = 2;
      mockPericopes[0].verses = [{ chapterNumber: 1, verseNumber: 2 }];
      mockFullPericopes![0].verses = [
        { chapterNumber: 1, verseNumber: 2 },
        { chapterNumber: 2, verseNumber: 1 },
      ];
      const texts = new Map([[2, 'Another adjacent reference verse']]);
      if (kind === 'blank') texts.set(1, '   ');
      mockReferenceChapters.set(2, { texts, loading: false, error: false });
      renderDrafting();
      await selectReferenceBible();
      expect(ttsRows.find(row => row.verseRef === '2')?.text).toBe('Hindi verse 2');
      expect(ttsRows.find(row => row.verseRef === '2:1')?.unavailable).toBe(true);
      expect(playback.groupKey(['2', '2:1'])).toBeNull();
      const play = screen.getByRole('button', { name: 'Play pericope 1:2–2:1' });
      expect(play).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(play);
      await userEvent.keyboard('{Alt>}p{/Alt}');
      expect(synthesize).not.toHaveBeenCalled();
      expect(elements).toHaveLength(0);
    }
  );

  it.each(['error', 'missing'] as const)(
    'does not silently omit adjacent %s source text',
    async kind => {
      crossing();
      const context = mockContextChapters.get(2)!;
      mockContextChapters.set(2, { ...context, sourceVerses: [], sourceIsError: kind === 'error' });
      renderDrafting();
      expect(ttsRows.find(row => row.verseRef === '2:1')?.unavailable).toBe(true);
      expect(playback.groupKey(['3', '2:1'])).toBeNull();
      await userEvent.keyboard('{Alt>}p{/Alt}');
      expect(synthesize).not.toHaveBeenCalled();
    }
  );
});
