import { createInstance } from 'i18next';
import { http, HttpResponse } from 'msw';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftingUI } from '@/features/bible/components/DraftingUI';
import { config } from '@/lib/config';
import {
  ChapterAssignmentStatus,
  type PericopeGroup,
  type ProjectItem,
  type Source,
  type TargetVerse,
  type User,
  type VerseData,
} from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { act, renderWithProviders, screen, waitFor, within } from '@/test/render';

import type * as ReactRouter from '@tanstack/react-router';

const external = vi.hoisted(() => ({
  navigate: vi.fn(),
  router: { history: { back: vi.fn() } },
  resourceState: { data: null, isFetched: true },
  saveResourceState: { mutate: vi.fn() },
  ai: { suggestions: {}, isAiThresholdMet: false, suggestionStatus: 'idle' },
  trackAi: { mutate: vi.fn() },
}));

// Isolate services outside drafting; the real drafting, pericope, context, debounce, mutation,
// and rendering paths run together, with their HTTP requests intercepted at the API boundary.
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => external.navigate,
  useRouter: () => external.router,
  useLocation: () => ({ pathname: '/translate', search: {} }),
}));
vi.mock('@/features/bible/hooks/useChapterPresence', () => ({
  useChapterPresence: () => ({ editorName: null }),
}));
vi.mock('@/features/bible/hooks/useResourceStatePersistence', () => ({
  useResourceState: () => external.resourceState,
  useSaveResourceState: () => external.saveResourceState,
}));
vi.mock('@/features/bible/hooks/useAiSuggestions', () => ({
  useAiSuggestions: () => external.ai,
  useTrackAiUsage: () => external.trackAi,
}));
vi.mock('@/features/flags', () => ({ useFeatureFlag: () => false }));

const i18n = createInstance();
const originalRteFlag = config.features.rtePericope;
const originalDisplayMode = useAppStore.getState().displayMode;

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: {}, fallbackLng: 'en' });
  // jsdom has no layout/scrolling; these browser methods do not affect draft persistence.
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: () => {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => {},
  });
});
beforeEach(() => {
  config.features.rtePericope = false;
  useAppStore.setState({ displayMode: 'pericope' });
});
afterEach(() => {
  config.features.rtePericope = originalRteFlag;
  useAppStore.setState({ displayMode: originalDisplayMode });
});

const user: User = {
  id: 17,
  username: 'translator',
  email: 'translator@example.com',
  role: 'Project Translator',
};
const assignment: ProjectItem = {
  chapterAssignmentId: 108,
  projectId: 7,
  projectName: 'Mark translation',
  projectUnitId: 70,
  bibleId: 3,
  bibleName: 'Source Bible',
  targetLanguage: 'English',
  targetLangCode: 'eng',
  bookId: 41,
  book: 'Mark',
  chapterStatus: ChapterAssignmentStatus.DRAFT,
  chapterNumber: 8,
  totalVerses: 38,
  completedVerses: 37,
  submittedTime: null,
  bookCode: 'MRK',
  sourceLangCode: 'eng',
  isAiEnabled: false,
};
const chapterEight: Source[] = Array.from({ length: 38 }, (_, index) => ({
  id: 801 + index,
  verseNumber: index + 1,
  text: `Source Mark 8:${index + 1}`,
}));
const chapterNine: Source[] = [
  { id: 901, verseNumber: 1, text: 'Source Mark 9:1' },
  { id: 902, verseNumber: 2, text: 'Source Mark 9:2' },
];
const completeGroup: PericopeGroup = {
  pericopeNumber: '44',
  pericopeTitle: 'The way of the cross',
  verses: [
    ...Array.from({ length: 8 }, (_, index) => ({ chapterNumber: 8, verseNumber: 31 + index })),
    { chapterNumber: 9, verseNumber: 1 },
  ],
};
const nextGroup: PericopeGroup = {
  pericopeNumber: '45',
  pericopeTitle: 'The transfiguration',
  verses: [{ chapterNumber: 9, verseNumber: 2 }],
};

function serveGroups(chapter: number) {
  server.use(
    http.get(`${config.api.url}/projects/7/pericopes/MRK/${chapter}`, ({ request }) => {
      if (new URL(request.url).searchParams.get('includeFullPericopes') !== 'true') {
        return new HttpResponse(null, { status: 400 });
      }
      return HttpResponse.json(chapter === 8 ? [completeGroup] : [completeGroup, nextGroup]);
    })
  );
}

function captureWrites() {
  const saved: unknown[] = [];
  const submitted: unknown[] = [];
  server.use(
    http.post(`${config.api.url}/translated-verses`, async ({ request }) => {
      const body = (await request.json()) as VerseData;
      saved.push(body);
      return HttpResponse.json({
        ...body,
        id: 1001,
        verseNumber: body.bibleTextId === 838 ? 38 : 1,
        markers: body.markers ?? null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    }),
    http.patch(`${config.api.url}/chapter-assignments/108/submit`, async ({ request }) => {
      submitted.push(await request.json());
      return HttpResponse.json({ chapterAssignmentId: 108, chapterStatus: 'peer_check' });
    })
  );
  return { saved, submitted };
}

describe('cross-chapter drafting integration', () => {
  it('keeps typed text when context arrives and saves/submits only the active chapter', async () => {
    serveGroups(8);
    const { saved, submitted } = captureWrites();
    let deliverNeighbor: () => void = () => {};
    const neighborReady = new Promise<void>(resolve => {
      deliverNeighbor = resolve;
    });
    server.use(
      http.get(`${config.api.url}/bibles/3/books/41/chapters/9/texts`, async () => {
        await neighborReady;
        return HttpResponse.json(chapterNine);
      }),
      http.get(`${config.api.url}/translated-verses`, () =>
        HttpResponse.json([
          {
            id: 9001,
            projectUnitId: 70,
            bibleTextId: 901,
            assignedUserId: 17,
            verseNumber: 1,
            content: 'Saved Mark 9:1',
            markers: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ])
      )
    );
    const targets: TargetVerse[] = chapterEight.map(source => ({
      verseNumber: source.verseNumber,
      content: source.verseNumber < 38 ? `Saved Mark 8:${source.verseNumber}` : '',
    }));
    const { user: translator } = renderWithProviders(
      <DraftingUI
        projectItem={assignment}
        sourceVerses={chapterEight}
        targetVerses={targets}
        userdetail={user}
      />
    );

    const editor = await screen.findByRole('textbox', { name: 'Translation for verse 38' });
    const submit = screen.getByRole('button', { name: 'Send to Peer Checking' });
    expect(submit).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Loading the rest of the pericope');
    await translator.type(editor, 'My current chapter draft');
    expect(saved).toEqual([]);

    await act(async () => {
      deliverNeighbor();
      await neighborReady;
    });

    expect(await screen.findByText('Source Mark 9:1')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: '8:31–9:1' })).toHaveLength(2);
    expect(screen.getByText('Source Mark 8:31')).toBeInTheDocument();
    expect(screen.queryByText('Source Mark 8:1')).not.toBeInTheDocument();
    expect(editor).toHaveValue('My current chapter draft');
    const context = screen.getByRole('region', { name: 'Chapter 9 context (read-only)' });
    expect(within(context).getByText('Saved Mark 9:1')).toBeInTheDocument();
    expect(within(context).queryByRole('textbox')).not.toBeInTheDocument();
    expect(submit).toBeEnabled();

    // Exercise the real two-second debounce; no focus change or submission forces this save.
    await waitFor(() => expect(saved).toHaveLength(1), { timeout: 3500 });
    expect(saved).toEqual([
      {
        projectUnitId: 70,
        content: 'My current chapter draft',
        bibleTextId: 838,
        assignedUserId: 17,
      },
    ]);

    await translator.click(submit);
    await waitFor(() => expect(submitted).toEqual([108]));
    expect(saved).toHaveLength(1);
  });

  it('retries a failed previous-chapter request without losing an unsaved current edit', async () => {
    serveGroups(9);
    const { saved } = captureWrites();
    let failNeighbor = true;
    server.use(
      http.get(`${config.api.url}/bibles/3/books/41/chapters/8/texts`, () =>
        HttpResponse.json(chapterEight)
      ),
      http.get(`${config.api.url}/translated-verses`, () =>
        failNeighbor ? new HttpResponse(null, { status: 500 }) : HttpResponse.json([])
      )
    );
    const { user: translator } = renderWithProviders(
      <DraftingUI
        projectItem={{
          ...assignment,
          chapterAssignmentId: 109,
          chapterNumber: 9,
          totalVerses: 2,
          completedVerses: 0,
        }}
        sourceVerses={chapterNine}
        targetVerses={[
          { verseNumber: 1, content: '' },
          { verseNumber: 2, content: '' },
        ]}
        userdetail={user}
      />
    );
    const editor = await screen.findByRole('textbox', { name: 'Translation for verse 1' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the complete pericope'
    );
    await translator.type(editor, 'Keep my new text');
    expect(saved).toEqual([]);

    failNeighbor = false;
    await translator.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Source Mark 8:31')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(editor).toHaveValue('Keep my new text');
    expect(screen.getByRole('button', { name: 'Send to Peer Checking' })).toBeDisabled();
    const context = screen.getByRole('region', { name: 'Chapter 8 context (read-only)' });
    expect(within(context).getAllByText('Not drafted')).toHaveLength(8);
    expect(within(context).queryByRole('textbox')).not.toBeInTheDocument();
    await waitFor(() => expect(saved).toHaveLength(1), { timeout: 3500 });
    expect(saved).toEqual([
      {
        projectUnitId: 70,
        content: 'Keep my new text',
        bibleTextId: 901,
        assignedUserId: 17,
      },
    ]);
  });

  it('enables Next Pericope from the completed current portion while neighboring verses are undrafted', async () => {
    config.features.rtePericope = true;
    serveGroups(9);
    const { saved } = captureWrites();
    server.use(
      http.get(`${config.api.url}/bibles/3/books/41/chapters/8/texts`, () =>
        HttpResponse.json(chapterEight)
      ),
      http.get(`${config.api.url}/translated-verses`, () => HttpResponse.json([]))
    );
    const { user: translator } = renderWithProviders(
      <DraftingUI
        projectItem={{
          ...assignment,
          chapterAssignmentId: 109,
          chapterNumber: 9,
          totalVerses: 2,
          completedVerses: 1,
        }}
        sourceVerses={chapterNine}
        targetVerses={[
          { verseNumber: 1, content: 'Completed current portion' },
          { verseNumber: 2, content: '' },
        ]}
        userdetail={user}
      />
    );

    const next = await screen.findByRole('button', { name: 'Next Pericope' });
    expect(await screen.findByText('Source Mark 8:31')).toBeInTheDocument();
    expect(next).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Send to Peer Checking' })).toBeDisabled();
    const context = screen.getByRole('region', { name: 'Chapter 8 context (read-only)' });
    expect(within(context).getAllByText('Not drafted')).toHaveLength(8);

    await translator.click(next);

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Next Pericope' })).not.toBeInTheDocument()
    );
    expect(screen.getByText('Source Mark 9:2').closest('[role="button"]')).toHaveClass(
      'border-primary'
    );
    expect(saved).toEqual([]);
    expect(screen.getByRole('button', { name: 'Send to Peer Checking' })).toBeDisabled();
  });
});
