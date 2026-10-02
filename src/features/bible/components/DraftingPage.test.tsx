import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type SavePayload } from '@/features/bible/hooks/useBibleTextDebounce';
import { useDrafting } from '@/features/bible/hooks/useDrafting';
import { type DraftingUIProps, type ProjectItem, type User } from '@/lib/types';
import { useAppStore } from '@/store/store';

import DraftingPage from './DraftingPage';

const match = vi.hoisted(() => ({
  loaderData: undefined as unknown,
}));
const saveVerse = vi.hoisted(() =>
  vi.fn<(assignmentId: number, sourceId: number, payload: SavePayload) => Promise<void>>()
);

vi.mock('@tanstack/react-router', () => ({
  useMatch: ({ from }: { from: string }) => (from.includes('/translation/') ? match : undefined),
}));

vi.mock('@/features/bible/hooks/useSyncGlobalAiSetting', () => ({
  useSyncGlobalAiSetting: vi.fn(),
}));

// Keep the real draft and save lifecycle while replacing only the visual editor.
vi.mock('./DraftingUI', () => ({
  DraftingUI: ({ projectItem, sourceVerses, targetVerses, readOnly = false }: DraftingUIProps) => {
    const draftingProps = {
      sourceVerses,
      targetVerses,
      readOnly,
      displayMode: 'verse' as const,
      onSave: (verse: number, payload: SavePayload) =>
        saveVerse(
          projectItem.chapterAssignmentId,
          sourceVerses.find(source => source.verseNumber === verse)!.id,
          payload
        ),
    };
    const { verses, handleTextChange } = useDrafting(draftingProps);
    return (
      <textarea
        aria-label='Translation'
        value={verses[0]?.content ?? ''}
        onChange={event => handleTextChange(1, event.target.value)}
      />
    );
  },
}));

const project: ProjectItem = {
  chapterAssignmentId: 396,
  projectId: 1,
  projectName: 'Test project',
  projectUnitId: 1,
  bibleId: 1,
  bibleName: 'Test Bible',
  targetLanguage: 'English',
  targetLangCode: 'eng',
  bookId: 1,
  book: 'Genesis',
  chapterStatus: 'draft',
  chapterNumber: 1,
  totalVerses: 1,
  completedVerses: 1,
  submittedTime: null,
  bookCode: 'GEN',
  sourceLangCode: 'eng',
};

const chapter = (projectItem = project, content = 'First chapter', loadedAt = 'first-load') => ({
  projectItem,
  sourceVerses: [{ id: projectItem.chapterAssignmentId * 100, verseNumber: 1, text: 'Source' }],
  targetVerses: [{ verseNumber: 1, content }],
  loadedAt,
});

describe('DraftingPage chapter identity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveVerse.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      roleChangeWarning: false,
      currentProjectItem: null,
      userdetail: { id: 1, role: 'Project Translator', grants: [] } as unknown as User,
    });
    match.loaderData = chapter();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts a new editor when navigating to another assignment', async () => {
    const { rerender } = render(<DraftingPage />);
    fireEvent.change(screen.getByLabelText('Translation'), {
      target: { value: 'Unsaved first chapter edit' },
    });

    match.loaderData = chapter({ ...project, chapterAssignmentId: 397, chapterNumber: 2 }, '');
    rerender(<DraftingPage />);

    expect(screen.getByLabelText('Translation')).toHaveValue('');
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(saveVerse).toHaveBeenCalledWith(396, 39600, {
      content: 'Unsaved first chapter edit',
      markers: undefined,
    });
  });

  it('preserves local edits when opening settings reloads the same assignment', () => {
    const { rerender } = render(<DraftingPage />);
    fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'Local draft' } });

    match.loaderData = chapter(project, 'Server draft', 'settings-navigation');
    rerender(<DraftingPage />);

    expect(screen.getByLabelText('Translation')).toHaveValue('Local draft');
    expect(saveVerse).not.toHaveBeenCalled();
  });

  it('waits for loader data before mounting an editor', () => {
    match.loaderData = undefined;
    const { rerender } = render(<DraftingPage />);
    expect(screen.queryByLabelText('Translation')).not.toBeInTheDocument();

    match.loaderData = chapter(project, 'Loaded draft');
    rerender(<DraftingPage />);
    expect(screen.getByLabelText('Translation')).toHaveValue('Loaded draft');
  });

  it('keeps saves for the same verse number isolated across assignments', async () => {
    const { rerender } = render(<DraftingPage />);
    fireEvent.change(screen.getByLabelText('Translation'), {
      target: { value: 'First chapter edit' },
    });
    match.loaderData = chapter(
      { ...project, chapterAssignmentId: 397, chapterNumber: 2 },
      'Second chapter'
    );
    rerender(<DraftingPage />);
    expect(screen.getByLabelText('Translation')).toHaveValue('Second chapter');
    fireEvent.change(screen.getByLabelText('Translation'), {
      target: { value: 'Second chapter edit' },
    });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(saveVerse.mock.calls).toEqual([
      [396, 39600, { content: 'First chapter edit', markers: undefined }],
      [397, 39700, { content: 'Second chapter edit', markers: undefined }],
    ]);
  });

  it('keeps a transient retry bound to its original assignment after navigation', async () => {
    saveVerse.mockRejectedValueOnce(new Error('offline'));
    const { rerender } = render(<DraftingPage />);
    fireEvent.change(screen.getByLabelText('Translation'), {
      target: { value: 'First chapter edit' },
    });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(saveVerse).toHaveBeenCalledTimes(1);
    match.loaderData = chapter(
      { ...project, chapterAssignmentId: 397, chapterNumber: 2 },
      'Second chapter'
    );
    rerender(<DraftingPage />);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(saveVerse).toHaveBeenCalledTimes(2);
    expect(saveVerse).toHaveBeenLastCalledWith(396, 39600, {
      content: 'First chapter edit',
      markers: undefined,
    });
  });

  it('flushes the latest edit even if its in-flight predecessor fails after navigation', async () => {
    let failSave: (error: Error) => void = () => {};
    saveVerse.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          failSave = reject;
        })
    );
    const { rerender } = render(<DraftingPage />);
    fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'Older edit' } });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'Latest edit' } });
    match.loaderData = chapter(
      { ...project, chapterAssignmentId: 397, chapterNumber: 2 },
      'Second chapter'
    );
    rerender(<DraftingPage />);
    await act(async () => {
      failSave(new Error('offline'));
    });
    expect(saveVerse).toHaveBeenLastCalledWith(396, 39600, {
      content: 'Latest edit',
      markers: undefined,
    });
  });

  it('retries a failed unmount flush without mixing it with the new chapter', async () => {
    saveVerse
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'));
    const { rerender } = render(<DraftingPage />);
    fireEvent.change(screen.getByLabelText('Translation'), {
      target: { value: 'First chapter edit' },
    });
    match.loaderData = chapter(
      { ...project, chapterAssignmentId: 397, chapterNumber: 2 },
      'Second chapter'
    );
    await act(async () => {
      rerender(<DraftingPage />);
    });
    expect(saveVerse).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(saveVerse).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(saveVerse.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [
        396,
        39600,
        { content: 'First chapter edit', markers: undefined },
      ])
    );
    expect(screen.getByLabelText('Translation')).toHaveValue('Second chapter');
  });
});
