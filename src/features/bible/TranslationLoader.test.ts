import { isRedirect } from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchTargetText } from '@/features/bible/hooks/useBibleTarget';
import { fetchBibleText } from '@/features/bible/hooks/useBibleText';
import { translationLoader } from '@/features/bible/TranslationLoader';
import type { ProjectItem } from '@/lib/types';
import { useAppStore } from '@/store/store';

vi.mock('@/features/bible/hooks/useBibleText', () => ({
  fetchBibleText: vi.fn(),
}));
vi.mock('@/features/bible/hooks/useBibleTarget', () => ({
  fetchTargetText: vi.fn(),
}));

/**
 * A fresh session has neither `userdetail` nor `currentProjectItem` in the store — that is every
 * deep link, new tab, or shared URL. The loader used to throw plain Errors there, which the route
 * surfaces as the "Something went wrong" boundary (#427, bug 4). A session that cannot resolve
 * its context belongs back on the dashboard instead.
 */
/** Every field the loader reads, so the fetch layer is called with real arguments. */
const projectItem: ProjectItem = {
  chapterAssignmentId: 1,
  projectId: 2,
  projectName: 'Test Project',
  projectUnitId: 3,
  bibleId: 4,
  bibleName: 'Test Bible',
  targetLanguage: 'Hindi',
  targetLangCode: 'hin',
  bookId: 5,
  book: 'Genesis',
  bookCode: 'GEN',
  chapterStatus: 'in_progress',
  chapterNumber: 6,
  totalVerses: 31,
  completedVerses: 0,
  submittedTime: null,
  sourceLangCode: 'eng',
};

describe('translationLoader without in-app navigation state', () => {
  beforeEach(() => {
    useAppStore.setState({ userdetail: null, currentProjectItem: null });
    vi.clearAllMocks();
  });

  it('redirects to the dashboard when user details are missing', async () => {
    const thrown = await translationLoader({ location: {} }).then(
      () => undefined,
      error => error as unknown
    );
    expect(isRedirect(thrown)).toBe(true);
  });

  it('redirects to the dashboard when no project item can be resolved', async () => {
    useAppStore.setState({
      userdetail: { id: 2, email: 't@fluent.local' } as never,
    });
    const thrown = await translationLoader({ location: {} }).then(
      () => undefined,
      error => error as unknown
    );
    expect(isRedirect(thrown)).toBe(true);
  });

  it('still loads normally when navigation state provides the project item', async () => {
    useAppStore.setState({
      userdetail: { id: 2, email: 't@fluent.local' } as never,
    });
    vi.mocked(fetchBibleText).mockResolvedValue([
      { id: 10, verseNumber: 1, text: 'in the beginning' },
    ] as never);
    vi.mocked(fetchTargetText).mockResolvedValue([
      { id: 20, verseNumber: 1, content: 'शुरुआत में' },
    ] as never);

    const result = await translationLoader({
      location: { search: { t: '1700000000' }, state: { projectItem } },
    });

    expect(fetchBibleText).toHaveBeenCalledWith(
      projectItem.bibleId,
      projectItem.bookId,
      projectItem.chapterNumber
    );
    expect(fetchTargetText).toHaveBeenCalledWith(
      projectItem.projectUnitId,
      projectItem.bookId,
      projectItem.chapterNumber
    );
    expect(result).toEqual({
      projectItem,
      sourceVerses: [{ id: 10, verseNumber: 1, text: 'in the beginning' }],
      // Absent `markers` normalises to null rather than staying undefined.
      targetVerses: [{ id: 20, verseNumber: 1, content: 'शुरुआत में', markers: null }],
      loadedAt: '1700000000',
    });
    // The resolved assignment is what the drafting page reads back out of the store.
    expect(useAppStore.getState().currentProjectItem).toEqual(projectItem);
  });

  /**
   * `location.search` is typed optional, so the loader has to survive its absence rather than
   * assert it away — reading `search.t` off an absent `search` threw a TypeError before.
   */
  it('falls back to a generated cache buster when there is no search', async () => {
    useAppStore.setState({
      userdetail: { id: 2, email: 't@fluent.local' } as never,
    });
    vi.mocked(fetchBibleText).mockResolvedValue([] as never);
    vi.mocked(fetchTargetText).mockResolvedValue([] as never);

    const result = await translationLoader({ location: { state: { projectItem } } });

    expect(result.loadedAt).toMatch(/^\d+$/);
    expect(result.sourceVerses).toEqual([]);
  });
});
