/**
 * Source-TTS gate, against the REAL flag stack (§12.1 "Flags" row, §6.3/T12).
 *
 * `DraftingUI.tts.test.tsx` stubs `@/features/flags` so it can drive the gate;
 * this file deliberately does not, so the fail-closed guarantee is proven
 * end-to-end through `useFeatureFlags` → `/config/features`: hidden while the
 * request is in flight, hidden when it fails, hidden when the API says off.
 *
 * It also discharges phase 2b's deferred manual check: with a local force-on and
 * **no backend TTS route**, the controls must appear, the attempt must actually
 * reach `/ai/tts/generate`, and the failure must surface as a toast (§5.2) —
 * with no override-specific wiring anywhere in this feature, because phase 2b
 * merges overrides at the single `useFeatureFlags` choke point (O3).
 */
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui/sonner';
import { DraftingUI } from '@/features/bible/components/DraftingUI';
import { clearFlagOverrides, refreshFlagOverrides, setFlagOverride } from '@/features/flags';
import { config } from '@/lib/config';
import {
  ChapterAssignmentStatus,
  type ProjectItem,
  type Source,
  type TargetVerse,
  type User,
} from '@/lib/types';
import { server } from '@/test/msw/server';
import { renderWithProviders, screen, waitFor } from '@/test/render';

import type * as ReactRouter from '@tanstack/react-router';

const FEATURES_URL = `${config.api.url}/config/features`;
const TTS_GENERATE_URL = `${config.api.url}/ai/tts/generate`;

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

// i18n is mocked so accessible names and the toast are the inline defaults.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string, options?: Record<string, unknown>) =>
      (defaultValue ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(options?.[name] ?? '')
      ),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// ── Drafting-side hooks: stubbed so no unrelated request leaves the page ─────
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
];

vi.mock('@/features/bible/hooks/useDrafting', () => ({
  useDrafting: () => ({
    verses: mockTargetVerses,
    activeVerseId: 1,
    revealedVerses: new Set([1, 2]),
    buttonTop: 150,
    lastRevealedVerseHasContent: true,
    lastRevealedVerseNumber: 2,
    targetScrollRef: { current: null },
    textareaRefs: { current: {} },
    verseRefs: { current: {} },
    getSaveStatus: () => ({
      showLoader: false,
      hasRetryScheduled: false,
      hasUnsavedChanges: false,
    }),
    saveImmediately: vi.fn(),
    handleTextChange: vi.fn(),
    handleActiveVerseChange: vi.fn(),
    moveToNextVerse: vi.fn(),
    revealNextVerse: vi.fn(),
    updateButtonPosition: vi.fn(),
  }),
}));

vi.mock('@/features/bible/hooks/usePericope', () => ({
  usePericope: () => ({
    pericopes: [],
    isPericopeMode: false,
    isPericopeLoading: false,
    getPericopeStyle: () => 'border-border',
    currentPericopeGroup: null,
    globalNextUntouchedVerse: null,
    resourceVerseId: 1,
    effectiveRevealedVerses: new Set([1, 2]),
    isNextButtonEnabled: true,
    handleNextClick: vi.fn(),
  }),
}));

vi.mock('@/features/resources/components/ResourcePanel', () => ({
  ResourcePanel: () => <div data-testid='mock-resource-panel' />,
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

/** Register the flags endpoint; `status` 500 simulates a dead/unreachable API. */
const publishFlags = (features: Record<string, boolean>, status = 200) => {
  const calls = { count: 0 };
  server.use(
    http.get(FEATURES_URL, () => {
      calls.count += 1;
      return HttpResponse.json({ features }, { status });
    })
  );
  return calls;
};

const renderDrafting = () =>
  renderWithProviders(
    <>
      <DraftingUI
        projectItem={mockProjectItem}
        sourceVerses={mockSourceVerses}
        targetVerses={mockTargetVerses}
        userdetail={{ id: 1 } as unknown as User}
      />
      <Toaster />
    </>
  );

const ttsControls = () => screen.queryAllByTestId('tts-verse-controls');

beforeEach(() => {
  localStorage.clear();
  refreshFlagOverrides();
});

afterEach(() => {
  clearFlagOverrides();
});

/**
 * Wait until the flags request has been answered and React Query has settled
 * into its resolved/error state, so "no controls" means fail-closed rather than
 * "the response simply hasn't arrived yet".
 */
const settle = async (calls: { count: number }) => {
  await waitFor(() => expect(calls.count).toBeGreaterThan(0));
  // Same tick-to-settle as `useFeatureFlags.test.tsx`'s error case.
  await new Promise(resolve => setTimeout(resolve, 20));
};

describe('DraftingUI — source-TTS gate through the real flag stack', () => {
  it('hides the controls until the published flag has actually arrived', async () => {
    publishFlags({ sourceAudio: true });

    renderDrafting();

    // Fail-closed: the first render happens before the response lands (§6.3).
    expect(ttsControls()).toHaveLength(0);
    await waitFor(() => expect(ttsControls()).toHaveLength(2));
  });

  it('keeps the controls hidden when /config/features is unreachable', async () => {
    // The server WOULD have said on; an unreachable flag service must still hide.
    const calls = publishFlags({ sourceAudio: true }, 500);

    renderDrafting();
    await settle(calls);

    expect(ttsControls()).toHaveLength(0);
  });

  it('keeps the controls hidden when the API publishes the flag off', async () => {
    const calls = publishFlags({ sourceAudio: false });

    renderDrafting();
    await settle(calls);

    expect(ttsControls()).toHaveLength(0);
  });

  it('shows the controls under a local force-on, with no override wiring here (O3)', async () => {
    // Phase 2b merges overrides at the single `useFeatureFlags` choke point, so
    // this feature adds none of its own — the force-on arrives for free.
    publishFlags({ sourceAudio: false });
    setFlagOverride('sourceAudio', true);

    renderDrafting();

    await waitFor(() => expect(ttsControls()).toHaveLength(2));
  });
});

/**
 * Phase 2b left one check to whoever shipped the first `sourceAudio` UI: force the
 * flag on where no backend exists and confirm the failure is visible rather than
 * silent. Both dependencies are absent here — the flag service is down AND
 * `/ai/tts/generate` 404s — which is exactly the dark-shipped state.
 */
describe('DraftingUI — forced-on with no TTS backend (phase 2b hand-off)', () => {
  it('shows the controls, really calls generate, and surfaces the failure as a toast', async () => {
    const flagCalls = publishFlags({}, 500);
    setFlagOverride('sourceAudio', true);

    const generateCalls: { count: number; body: unknown } = { count: 0, body: null };
    server.use(
      http.post(TTS_GENERATE_URL, async ({ request }) => {
        generateCalls.count += 1;
        generateCalls.body = await request.json();
        return HttpResponse.json({ error: 'Not Found' }, { status: 404 });
      })
    );

    const { user } = renderDrafting();
    await settle(flagCalls);

    // 1. The controls appear despite the dead flag service (O4).
    expect(ttsControls()).toHaveLength(2);

    // 2. The attempt actually leaves the browser, carrying T18's language hint.
    //    This is the real HTTP body, so the field is the wire's `lang_code` —
    //    the camelCase `langCode` lives only in the in-app engine seam.
    await user.click(screen.getByRole('button', { name: 'Play verse 1' }));
    await waitFor(() => expect(generateCalls.count).toBe(1));
    expect(generateCalls.body).toMatchObject({
      text: 'In the beginning God created the heaven and the earth.',
      lang_code: 'eng',
    });

    // 3. The failure is visible and names the verse — not a silent no-op (§5.2).
    await waitFor(() =>
      expect(
        screen.getByText('Could not play audio for verse 1. Please try again.')
      ).toBeInTheDocument()
    );
  });
});
