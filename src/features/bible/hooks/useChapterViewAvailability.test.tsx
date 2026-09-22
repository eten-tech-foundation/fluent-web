import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import type { ProjectItem, Source, TargetVerse } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { useChapterViewAvailability } from './useChapterViewAvailability';
import { useDrafting } from './useDrafting';

const PROJECT: ProjectItem = {
  chapterAssignmentId: 396,
  projectId: 1,
  projectName: 'Chapter availability test',
  projectUnitId: 2,
  bibleId: 3,
  bibleName: 'Test source',
  targetLanguage: 'English',
  targetLangCode: 'eng',
  bookId: 4,
  book: 'Genesis',
  chapterStatus: 'draft',
  chapterNumber: 1,
  totalVerses: 2,
  completedVerses: 0,
  submittedTime: null,
  bookCode: 'GEN',
  sourceLangCode: 'eng',
};

const SOURCES: Source[] = [
  { id: 1, verseNumber: 1, text: 'First source verse.' },
  { id: 2, verseNumber: 2, text: 'Second source verse.' },
];

const COMPLETE: TargetVerse[] = [
  { verseNumber: 1, content: 'First translated verse.' },
  { verseNumber: 2, content: 'Second translated verse.' },
];

const initialFeatureFlag = config.features.rtePericope;

describe('useChapterViewAvailability', () => {
  beforeEach(() => {
    config.features.rtePericope = true;
    useAppStore.setState({
      currentProjectItem: PROJECT,
      chapterViewAvailability: null,
      displayMode: 'verse',
    });
  });

  afterEach(() => {
    cleanup();
    config.features.rtePericope = initialFeatureFlag;
    vi.useRealTimers();
  });

  it.each<{
    name: string;
    sourceVerses: Source[];
    verses: TargetVerse[];
    totalVerses?: number;
  }>([
    { name: 'chapter data has not arrived', sourceVerses: [], verses: [] },
    { name: 'an empty chapter reports zero verses', sourceVerses: [], verses: [], totalVerses: 0 },
    {
      name: 'only part of the source chapter arrived',
      sourceVerses: [SOURCES[0]],
      verses: COMPLETE,
    },
    {
      name: 'source data contains duplicate verse numbers',
      sourceVerses: [SOURCES[0], SOURCES[0]],
      verses: COMPLETE,
    },
    {
      name: 'a later duplicate hides the first empty target',
      sourceVerses: SOURCES,
      verses: [COMPLETE[0], { verseNumber: 2, content: '' }, COMPLETE[1]],
    },
    { name: 'no translations exist yet', sourceVerses: SOURCES, verses: [] },
    { name: 'a target verse is missing', sourceVerses: SOURCES, verses: [COMPLETE[0]] },
    {
      name: 'a target verse is empty',
      sourceVerses: SOURCES,
      verses: [COMPLETE[0], { verseNumber: 2, content: '' }],
    },
    {
      name: 'a target verse contains only whitespace',
      sourceVerses: SOURCES,
      verses: [COMPLETE[0], { verseNumber: 2, content: ' \n\t ' }],
    },
    {
      name: 'another verse masks the missing target in a count',
      sourceVerses: SOURCES,
      verses: [COMPLETE[0], { verseNumber: 3, content: 'Unrelated verse.' }],
    },
    {
      name: 'a duplicate target masks a missing verse in a count',
      sourceVerses: SOURCES,
      verses: [COMPLETE[0], COMPLETE[0]],
    },
    {
      name: 'metadata claims completion but a target is blank',
      sourceVerses: SOURCES,
      verses: [COMPLETE[0], { verseNumber: 2, content: '' }],
    },
  ])('stays unavailable when $name', ({ sourceVerses, verses, totalVerses }) => {
    const projectItem = {
      ...PROJECT,
      completedVerses: 2,
      totalVerses: totalVerses ?? PROJECT.totalVerses,
    };
    const { result } = renderHook(() =>
      useChapterViewAvailability({ projectItem, sourceVerses, verses })
    );

    expect(result.current).toBe(false);
    expect(useAppStore.getState().chapterViewAvailability).toEqual({
      chapterAssignmentId: PROJECT.chapterAssignmentId,
      available: false,
    });
  });

  it('enables a complete chapter even before saved progress metadata catches up', () => {
    const { result } = renderHook(() =>
      useChapterViewAvailability({ projectItem: PROJECT, sourceVerses: SOURCES, verses: COMPLETE })
    );

    expect(result.current).toBe(true);
    expect(useAppStore.getState().chapterViewAvailability).toEqual({
      chapterAssignmentId: PROJECT.chapterAssignmentId,
      available: true,
    });
  });

  it('matches verse numbers rather than relying on target order or count', () => {
    const { result } = renderHook(() =>
      useChapterViewAvailability({
        projectItem: PROJECT,
        sourceVerses: SOURCES,
        verses: [COMPLETE[1], { verseNumber: 8, content: 'An unrelated row.' }, COMPLETE[0]],
      })
    );

    expect(result.current).toBe(true);
  });

  it('keeps Chapter unavailable while the editor feature is disabled', () => {
    config.features.rtePericope = false;
    const { result } = renderHook(() =>
      useChapterViewAvailability({ projectItem: PROJECT, sourceVerses: SOURCES, verses: COMPLETE })
    );

    expect(result.current).toBe(false);
    expect(useAppStore.getState().chapterViewAvailability?.available).toBe(false);
  });

  it('updates as chapter data arrives, without enabling a partial response', () => {
    const { result, rerender } = renderHook(
      ({ sourceVerses, verses }) =>
        useChapterViewAvailability({ projectItem: PROJECT, sourceVerses, verses }),
      {
        initialProps: { sourceVerses: [] as Source[], verses: [] as TargetVerse[] },
      }
    );

    expect(result.current).toBe(false);
    rerender({ sourceVerses: SOURCES, verses: [COMPLETE[0]] });
    expect(result.current).toBe(false);
    rerender({ sourceVerses: SOURCES, verses: COMPLETE });
    expect(result.current).toBe(true);
  });

  it('follows unsaved edits from the real drafting hook when the last verse is filled and cleared', () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const targetVerses = [COMPLETE[0], { verseNumber: 2, content: '' }];
    const { result } = renderHook(() => {
      const drafting = useDrafting({
        sourceVerses: SOURCES,
        targetVerses,
        readOnly: false,
        onSave,
      });
      const available = useChapterViewAvailability({
        projectItem: PROJECT,
        sourceVerses: SOURCES,
        verses: drafting.verses,
      });
      return { available, handleTextChange: drafting.handleTextChange, verses: drafting.verses };
    });

    expect(result.current.available).toBe(false);
    act(() => result.current.handleTextChange(2, 'An unsaved final verse.'));
    expect(result.current.available).toBe(true);
    expect(useAppStore.getState().chapterViewAvailability?.available).toBe(true);
    expect(onSave).not.toHaveBeenCalled();

    act(() => result.current.handleTextChange(2, ' \n\t '));
    expect(result.current.available).toBe(false);
    expect(useAppStore.getState().chapterViewAvailability?.available).toBe(false);
    expect(onSave).not.toHaveBeenCalled();

    act(() => result.current.handleTextChange(2, 'The verse is complete again.'));
    expect(result.current.available).toBe(true);
    expect(result.current.verses.find(verse => verse.verseNumber === 2)?.content).toBe(
      'The verse is complete again.'
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears its availability when the drafting surface unmounts', () => {
    const { unmount } = renderHook(() =>
      useChapterViewAvailability({ projectItem: PROJECT, sourceVerses: SOURCES, verses: COMPLETE })
    );
    expect(useAppStore.getState().chapterViewAvailability?.available).toBe(true);

    unmount();

    expect(useAppStore.getState().chapterViewAvailability).toBeNull();
  });

  it('does not let an old chapter cleanup clear the next chapter snapshot', () => {
    const previous = renderHook(() =>
      useChapterViewAvailability({ projectItem: PROJECT, sourceVerses: SOURCES, verses: COMPLETE })
    );
    const nextProject = { ...PROJECT, chapterAssignmentId: 397, chapterNumber: 2 };
    act(() => useAppStore.getState().setCurrentProjectItem(nextProject));
    renderHook(() =>
      useChapterViewAvailability({
        projectItem: nextProject,
        sourceVerses: SOURCES,
        verses: [COMPLETE[0]],
      })
    );

    previous.unmount();

    expect(useAppStore.getState().chapterViewAvailability).toEqual({
      chapterAssignmentId: nextProject.chapterAssignmentId,
      available: false,
    });
  });

  it('does not change the selected display preference while reporting availability', () => {
    useAppStore.setState({ displayMode: 'chapter' });
    renderHook(() =>
      useChapterViewAvailability({ projectItem: PROJECT, sourceVerses: SOURCES, verses: [] })
    );

    expect(useAppStore.getState().displayMode).toBe('chapter');
  });
});

describe('chapter availability store lifecycle', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentProjectItem: PROJECT,
      chapterViewAvailability: {
        chapterAssignmentId: PROJECT.chapterAssignmentId,
        available: true,
      },
    });
  });

  it('clears availability when changing assignments', () => {
    useAppStore.getState().setCurrentProjectItem({ ...PROJECT, chapterAssignmentId: 397 });
    expect(useAppStore.getState().chapterViewAvailability).toBeNull();
  });

  it.each(['clearCurrentProjectItem', 'clearUserDetail'] as const)(
    'clears availability on %s',
    action => {
      useAppStore.getState()[action]();
      expect(useAppStore.getState().chapterViewAvailability).toBeNull();
    }
  );

  it('clears availability when the assignment is set to null', () => {
    useAppStore.getState().setCurrentProjectItem(null);
    expect(useAppStore.getState().chapterViewAvailability).toBeNull();
  });

  it('preserves live availability through same-assignment metadata updates', () => {
    useAppStore
      .getState()
      .setCurrentProjectItem({ ...PROJECT, completedVerses: 2, isAiEnabled: true });
    expect(useAppStore.getState().chapterViewAvailability).toEqual({
      chapterAssignmentId: PROJECT.chapterAssignmentId,
      available: true,
    });
  });

  it('does not persist availability for the next page load', () => {
    const partialize = useAppStore.persist.getOptions().partialize;
    expect(partialize).toBeDefined();
    expect(partialize?.(useAppStore.getState())).not.toHaveProperty('chapterViewAvailability');
  });
});
