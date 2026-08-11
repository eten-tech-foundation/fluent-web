import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PericopeRteGroup } from '@/features/bible/components/PericopeRteGroup';
import type { Source, TargetVerse } from '@/lib/types';

/**
 * The editor itself is exercised in `PericopeEditor.test.tsx` against a document-keeping stand-in;
 * what matters here is the drafting affordances around it, so it is replaced by a plain element.
 */
vi.mock('@/features/rte/components/PericopeEditor', () => ({
  PericopeEditor: () => <div data-testid='pericope-editor' />,
}));

const GROUP_VERSES: Source[] = [
  { id: 1, verseNumber: 1, text: 'Source 1' },
  { id: 2, verseNumber: 2, text: 'Source 2' },
];

const handleNextPericopeClick = vi.fn(() => Promise.resolve());
const handleActiveVerseChange = vi.fn();
const handleTextChange = vi.fn();

const renderGroup = (overrides: Partial<React.ComponentProps<typeof PericopeRteGroup>> = {}) =>
  render(
    <PericopeRteGroup
      activeVerseId={1}
      aiSuggestions={{}}
      bookCode='GEN'
      chapterAssignmentId={7}
      chapterNumber={1}
      groupVerses={GROUP_VERSES}
      handleActiveVerseChange={handleActiveVerseChange}
      handleNextPericopeClick={handleNextPericopeClick}
      handleTextChange={handleTextChange}
      hasNextPericope={true}
      isAiActive={false}
      isAiThresholdMet={false}
      isTranslationComplete={false}
      readOnly={false}
      suggestionStatus='idle'
      verses={
        [
          { verseNumber: 1, content: 'Drafted 1' },
          { verseNumber: 2, content: 'Drafted 2' },
        ] as TargetVerse[]
      }
      {...overrides}
    />
  );

describe('PericopeRteGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers a Next Pericope button rather than a Next Verse one', () => {
    renderGroup();

    expect(screen.getByRole('button', { name: 'Next Pericope' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next Verse' })).not.toBeInTheDocument();
  });

  it('places the button below the editor', () => {
    renderGroup();

    const editor = screen.getByTestId('pericope-editor');
    const button = screen.getByRole('button', { name: 'Next Pericope' });

    // Node.DOCUMENT_POSITION_FOLLOWING: the button comes after the editor in the surface.
    expect(editor.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('advances by pericope when clicked', async () => {
    const user = userEvent.setup();
    renderGroup();

    await user.click(screen.getByRole('button', { name: 'Next Pericope' }));

    expect(handleNextPericopeClick).toHaveBeenCalledTimes(1);
  });

  it('waits until every verse of the pericope is drafted', () => {
    renderGroup({
      verses: [
        { verseNumber: 1, content: 'Drafted 1' },
        { verseNumber: 2, content: '' },
      ],
    });

    expect(screen.getByRole('button', { name: 'Next Pericope' })).toBeDisabled();
  });

  it('hides the button on the last pericope of the chapter', () => {
    renderGroup({ hasNextPericope: false });

    expect(screen.queryByRole('button', { name: 'Next Pericope' })).not.toBeInTheDocument();
  });

  it('hides the button while another pericope is the active one', () => {
    renderGroup({ activeVerseId: 9 });

    expect(screen.queryByRole('button', { name: 'Next Pericope' })).not.toBeInTheDocument();
  });

  it('does not advance on Enter, which the editor keeps for a paragraph break', () => {
    renderGroup();

    // Dispatched on the editor itself so it bubbles the whole surface, the way a real keystroke
    // inside the editor would: nothing on this path may turn Enter into an advance (#314).
    fireEvent.keyDown(screen.getByTestId('pericope-editor'), { key: 'Enter', code: 'Enter' });

    expect(handleNextPericopeClick).not.toHaveBeenCalled();
    expect(handleActiveVerseChange).not.toHaveBeenCalled();
  });
});
