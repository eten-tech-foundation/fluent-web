import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePericope } from '@/features/bible/hooks/usePericope';
import type { PericopeGroup, ProjectItem, Source, TargetVerse } from '@/lib/types';

const mockUseChapterPericopes = vi.fn();

vi.mock('@/features/pericopes/hooks/useChapterPericopes', () => ({
  useChapterPericopes: () => mockUseChapterPericopes() as unknown,
}));

const verseRefs = (...verseNumbers: number[]) =>
  verseNumbers.map(verseNumber => ({ chapterNumber: 1, verseNumber }));

const PERICOPES: PericopeGroup[] = [
  { pericopeNumber: '1', pericopeTitle: 'The first section', verses: verseRefs(1, 2, 3) },
  { pericopeNumber: '2', pericopeTitle: 'The second section', verses: verseRefs(4, 5) },
];

const ALL_VERSES = [1, 2, 3, 4, 5];

const SOURCE_VERSES: Source[] = ALL_VERSES.map(verseNumber => ({
  id: verseNumber,
  verseNumber,
  text: `Source ${verseNumber}`,
}));

/** Target verses where the listed ones are drafted and the rest are still empty. */
const drafted = (...verseNumbers: number[]): TargetVerse[] =>
  ALL_VERSES.map(verseNumber => ({
    verseNumber,
    content: verseNumbers.includes(verseNumber) ? `Draft ${verseNumber}` : '',
  }));

const handleActiveVerseChange = vi.fn();
const saveImmediately = vi.fn(() => Promise.resolve());
const getSaveStatus = vi.fn(() => ({ hasUnsavedChanges: false }));

const renderPericope = (activeVerseId: number, verses: TargetVerse[]) =>
  renderHook(() =>
    usePericope({
      projectItem: { projectId: 1, bookCode: 'GEN', chapterNumber: 1 } as ProjectItem,
      sourceVerses: SOURCE_VERSES,
      verses,
      activeVerseId,
      revealedVerses: new Set<number>(),
      lastRevealedVerseHasContent: true,
      displayMode: 'pericope',
      getSaveStatus,
      saveImmediately,
      handleActiveVerseChange,
      revealNextVerse: vi.fn(),
    })
  );

describe('usePericope handleNextPericopeClick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSaveStatus.mockReturnValue({ hasUnsavedChanges: false });
    mockUseChapterPericopes.mockReturnValue({ data: PERICOPES, isLoading: false });
  });

  it('advances to the first verse of the next pericope, not to the next verse', async () => {
    // Whole chapter drafted, so nothing pulls the cursor anywhere except the advance itself.
    const { result } = renderPericope(1, drafted(...ALL_VERSES));

    await result.current.handleNextPericopeClick();

    // Verse 2 is the next verse; verse 4 opens the next pericope. The button moves whole pericopes.
    expect(handleActiveVerseChange).toHaveBeenCalledTimes(1);
    expect(handleActiveVerseChange).toHaveBeenCalledWith(4);
  });

  it('skips past an untouched verse inside the pericope being left', async () => {
    // `handleNextClick` stops at the next untouched verse, which is verse 3 here. The rich text
    // surface shows the whole pericope at once, so that verse is already in front of the drafter.
    const { result } = renderPericope(1, drafted(1, 2));

    await result.current.handleNextPericopeClick();

    expect(handleActiveVerseChange).toHaveBeenCalledTimes(1);
    expect(handleActiveVerseChange).toHaveBeenCalledWith(4);
  });

  it('skips a pericope the grid renders nothing for', async () => {
    // Verses 6-7 are outside this chapter's source, so `DraftingGridPericope` renders no box for
    // that pericope. Advancing into it would strand the drafter: no box is active, so the Next
    // Pericope button disappears too.
    mockUseChapterPericopes.mockReturnValue({
      data: [
        { pericopeNumber: '1', pericopeTitle: 'First', verses: verseRefs(1, 2) },
        { pericopeNumber: 'gap', pericopeTitle: 'Unbacked', verses: verseRefs(6, 7) },
        { pericopeNumber: '3', pericopeTitle: 'Third', verses: verseRefs(3, 4, 5) },
      ],
      isLoading: false,
    });
    const { result } = renderPericope(1, drafted(...ALL_VERSES));

    await result.current.handleNextPericopeClick();

    expect(handleActiveVerseChange).toHaveBeenCalledTimes(1);
    expect(handleActiveVerseChange).toHaveBeenCalledWith(3);
  });

  it('does nothing when every later pericope renders nothing', async () => {
    mockUseChapterPericopes.mockReturnValue({
      data: [
        { pericopeNumber: '1', pericopeTitle: 'First', verses: verseRefs(1, 2, 3, 4, 5) },
        { pericopeNumber: 'gap', pericopeTitle: 'Unbacked', verses: verseRefs(6, 7) },
      ],
      isLoading: false,
    });
    const { result } = renderPericope(1, drafted(...ALL_VERSES));

    await result.current.handleNextPericopeClick();

    expect(handleActiveVerseChange).not.toHaveBeenCalled();
  });

  it('does nothing on the last pericope of the chapter', async () => {
    const { result } = renderPericope(4, drafted(...ALL_VERSES));

    await result.current.handleNextPericopeClick();

    expect(handleActiveVerseChange).not.toHaveBeenCalled();
  });

  it('flushes an unsaved verse before leaving the pericope', async () => {
    getSaveStatus.mockReturnValue({ hasUnsavedChanges: true });
    const { result } = renderPericope(2, drafted(1, 2, 3));

    await result.current.handleNextPericopeClick();

    expect(saveImmediately).toHaveBeenCalledWith(2, { content: 'Draft 2', markers: undefined });
    expect(handleActiveVerseChange).toHaveBeenCalledWith(4);
  });

  it('leaves the verse-by-verse handler alone for the textarea path', async () => {
    const { result } = renderPericope(1, drafted(...ALL_VERSES));

    await result.current.handleNextClick();

    // Same starting point, same chapter: the textarea path still steps one verse at a time,
    // where `handleNextPericopeClick` would have gone straight to verse 4.
    expect(handleActiveVerseChange).toHaveBeenCalledWith(2);
  });
});
