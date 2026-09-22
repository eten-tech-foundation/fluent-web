import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type DraftingUIProps, type ProjectItem, type User } from '@/lib/types';
import { useAppStore } from '@/store/store';

import DraftingPage from './DraftingPage';

const match = vi.hoisted(() => ({
  loaderData: undefined as unknown,
}));

vi.mock('@tanstack/react-router', () => ({
  useMatch: ({ from }: { from: string }) => (from.includes('/translation/') ? match : undefined),
}));

vi.mock('@/features/bible/hooks/useSyncGlobalAiSetting', () => ({
  useSyncGlobalAiSetting: vi.fn(),
}));

// The editor owns local state for its mounted assignment, just as useDrafting does.
vi.mock('./DraftingUI', () => ({
  DraftingUI: ({ targetVerses }: DraftingUIProps) => {
    const [content, setContent] = useState(targetVerses[0]?.content ?? '');
    return (
      <textarea
        aria-label='Translation'
        value={content}
        onChange={event => setContent(event.target.value)}
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
  sourceVerses: [{ id: 1, verseNumber: 1, text: 'Source' }],
  targetVerses: [{ verseNumber: 1, content }],
  loadedAt,
});

describe('DraftingPage chapter identity', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentProjectItem: null,
      userdetail: { id: 1, role: 'Project Translator', grants: [] } as unknown as User,
    });
    match.loaderData = chapter();
  });

  it('starts a new editor when navigating to another assignment', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DraftingPage />);
    await user.clear(screen.getByLabelText('Translation'));
    await user.type(screen.getByLabelText('Translation'), 'Unsaved first chapter edit');

    match.loaderData = chapter({ ...project, chapterAssignmentId: 397, chapterNumber: 2 }, '');
    rerender(<DraftingPage />);

    expect(screen.getByLabelText('Translation')).toHaveValue('');
  });

  it('preserves local edits when opening settings reloads the same assignment', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DraftingPage />);
    await user.clear(screen.getByLabelText('Translation'));
    await user.type(screen.getByLabelText('Translation'), 'Local draft');

    match.loaderData = chapter(project, 'Server draft', 'settings-navigation');
    rerender(<DraftingPage />);

    expect(screen.getByLabelText('Translation')).toHaveValue('Local draft');
  });

  it('waits for loader data before mounting an editor', () => {
    match.loaderData = undefined;
    const { rerender } = render(<DraftingPage />);
    expect(screen.queryByLabelText('Translation')).not.toBeInTheDocument();

    match.loaderData = chapter(project, 'Loaded draft');
    rerender(<DraftingPage />);
    expect(screen.getByLabelText('Translation')).toHaveValue('Loaded draft');
  });
});
