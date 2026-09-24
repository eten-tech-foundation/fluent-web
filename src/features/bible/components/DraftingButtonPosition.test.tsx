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
  type User,
} from '@/lib/types';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';
import { act, renderWithProviders, screen, waitFor } from '@/test/render';

import type * as ReactRouter from '@tanstack/react-router';

const external = vi.hoisted(() => ({
  navigate: vi.fn(),
  router: { history: { back: vi.fn() } },
  resourceState: { data: null, isFetched: true },
  saveResourceState: { mutate: vi.fn() },
  ai: { suggestions: {}, isAiThresholdMet: false, suggestionStatus: 'idle' },
  trackAi: { mutate: vi.fn() },
}));

// Keep drafting, pericope selection and both editor surfaces real.
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
  chapterNumber: 1,
  totalVerses: 4,
  completedVerses: 2,
  submittedTime: null,
  bookCode: 'MRK',
  sourceLangCode: 'eng',
  isAiEnabled: false,
};
const sources: Source[] = [1, 2, 3, 4].map(verseNumber => ({
  id: 100 + verseNumber,
  verseNumber,
  text: 'Source verse ' + verseNumber,
}));
const savedFirstVerse = 'Saved first verse\nA longer translation\nWith another line';
const groups: PericopeGroup[] = [
  {
    pericopeNumber: '1',
    pericopeTitle: 'First pericope',
    verses: [1, 2, 3].map(verseNumber => ({ chapterNumber: 1, verseNumber })),
  },
  {
    pericopeNumber: '2',
    pericopeTitle: 'Second pericope',
    verses: [{ chapterNumber: 1, verseNumber: 4 }],
  },
];

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: {}, fallbackLng: 'en' });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: () => {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => {},
  });
});
beforeEach(() => {
  useAppStore.setState({ displayMode: 'pericope' });
  server.use(
    http.get(config.api.url + '/projects/7/pericopes/MRK/1', () => HttpResponse.json(groups))
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  config.features.rtePericope = originalRteFlag;
  useAppStore.setState({ displayMode: originalDisplayMode });
});

describe('Next Verse position after changing the drafting view', () => {
  it.each([
    { label: 'rich text', rte: true },
    { label: 'textarea', rte: false },
  ])('follows the verse row after leaving the $label pericope editor', async ({ rte }) => {
    config.features.rtePericope = rte;
    let measuredPericope = false;
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.closest('.hidden') ? null : this.parentElement;
    });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this instanceof HTMLTextAreaElement && this.value.includes('\n') ? 240 : 20;
    });
    // jsdom has no layout. A pericope is taller than a verse, while the shared scroll
    // viewport stays fixed. Its ResizeObserver stub never emits a resize notification.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.classList.contains('overflow-y-auto')) return new DOMRect(0, 80, 1000, 600);
      if (this.classList.contains('py-4') && this.style.gridTemplateColumns === '1fr 1fr') {
        measuredPericope = true;
        return new DOMRect(0, 80, 1000, 600);
      }
      if (this.classList.contains('py-4') && this.style.gridTemplateColumns === '2rem 1fr 1fr') {
        const verseNumber = Number(this.querySelector('span')?.textContent);
        const rowHeight = (verse: number) => {
          const textarea = this.parentElement?.querySelector<HTMLTextAreaElement>(
            '[aria-label="Translation for verse ' + verse + '"]'
          );
          const textareaHeight = textarea?.style.height;
          return Math.max(160, (textareaHeight ? Number.parseFloat(textareaHeight) : 0) + 40);
        };
        const previousHeight = Array.from({ length: verseNumber - 1 }, (_, index) =>
          rowHeight(index + 1)
        ).reduce((sum, height) => sum + height, 0);
        return new DOMRect(0, 80 + previousHeight, 1000, rowHeight(verseNumber));
      }
      return new DOMRect();
    });
    const { container, user: translator } = renderWithProviders(
      <DraftingUI
        projectItem={assignment}
        sourceVerses={sources}
        targetVerses={[
          { verseNumber: 1, content: savedFirstVerse },
          { verseNumber: 2, content: 'Saved second verse' },
          { verseNumber: 3, content: '' },
          { verseNumber: 4, content: '' },
        ]}
        userdetail={user}
      />
    );
    const scrollContainer = container.querySelector<HTMLElement>('.overflow-y-auto')!;
    scrollContainer.scrollTop = 60;
    await screen.findByText('Source verse 1');
    if (rte) {
      await screen.findByRole('button', { name: 'Next Pericope' }, { timeout: 3000 });
    } else {
      expect(screen.getByRole('textbox', { name: 'Translation for verse 1' })).toHaveValue(
        savedFirstVerse
      );
    }
    // Let the initial measurement finish so it cannot accidentally repair the mode switch.
    await waitFor(() => expect(measuredPericope).toBe(true));

    // Only the view changes: no resize, scroll event, edit, or verse selection.
    act(() => useAppStore.setState({ displayMode: 'verse' }));

    const next = await screen.findByRole('button', { name: 'Next Verse' });
    expect(next.parentElement).toHaveStyle({ top: '500px' });
    expect(screen.getByRole('textbox', { name: 'Translation for verse 1' })).toHaveValue(
      savedFirstVerse
    );
    // The earlier verse also remounts; measuring before resizing it leaves the button too high.
    expect(screen.getByRole('textbox', { name: 'Translation for verse 1' })).toHaveStyle({
      height: '240px',
    });
    expect(next).toBeEnabled();

    await translator.click(next);
    const thirdVerse = screen.getByRole('textbox', { name: 'Translation for verse 3' });
    expect(thirdVerse).toHaveFocus();
    expect(next.parentElement).toHaveStyle({ top: '660px' });
    expect(next).toBeDisabled();

    // Returning to pericope and back must remeasure the currently revealed row again.
    act(() => useAppStore.setState({ displayMode: 'pericope' }));
    await screen.findByText('Source verse 1');
    act(() => useAppStore.setState({ displayMode: 'verse' }));
    expect((await screen.findByRole('button', { name: 'Next Verse' })).parentElement).toHaveStyle({
      top: '660px',
    });
    expect(screen.getByRole('textbox', { name: 'Translation for verse 1' })).toHaveValue(
      savedFirstVerse
    );
    expect(screen.getByRole('textbox', { name: 'Translation for verse 3' })).toHaveValue('');
  });
});
