import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PericopeRteGroup } from '@/features/bible/components/PericopeRteGroup';
import type { Source, TargetVerse } from '@/lib/types';

/**
 * The editor itself is exercised in `PericopeEditor.test.tsx` against a document-keeping stand-in;
 * what matters here is the drafting affordances around it, so it is replaced by a plain element
 * that records the props it was handed.
 */
const editorProps = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('@/features/rte/components/PericopeEditor', () => ({
  PericopeEditor: (props: unknown) => {
    editorProps.current = props;
    return <div data-testid='pericope-editor' />;
  },
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

  describe('while a suggestion is on its way', () => {
    const waiting = {
      isAiActive: true,
      isAiThresholdMet: true,
      suggestionStatus: 'generating' as const,
      verses: [
        { verseNumber: 1, content: '' },
        { verseNumber: 2, content: '' },
      ] as TargetVerse[],
    };

    it('says so, the way the textarea placeholder does', () => {
      renderGroup(waiting);

      expect(screen.getByText('Generating...')).toBeInTheDocument();
    });

    it('keeps the notice until the rest of the group is ready', () => {
      renderGroup({ ...waiting, aiSuggestions: { 1: 'Sugerencia.' } });

      expect(screen.getByText('Generating...')).toBeInTheDocument();
    });

    it('still shows pending work when the focused verse is already drafted', () => {
      renderGroup({
        ...waiting,
        verses: [
          { verseNumber: 1, content: 'Ya traducido.' },
          { verseNumber: 2, content: '' },
        ] as TargetVerse[],
      });

      expect(screen.getByText('Generating...')).toBeInTheDocument();
    });

    it('stops once all suggestions have landed', () => {
      renderGroup({ ...waiting, aiSuggestions: { 1: 'First draft', 2: 'Second draft' } });
      expect(screen.queryByText('Generating...')).not.toBeInTheDocument();
    });
  });

  it('passes stored markers into the editor verses', () => {
    const split = {
      paragraphs: [
        { marker: 'p', offset: 0 },
        { marker: 'p', offset: 12 },
      ],
    };
    renderGroup({
      verses: [
        { verseNumber: 1, content: 'Drafted 1', markers: split },
        { verseNumber: 2, content: 'Drafted 2' },
      ] as TargetVerse[],
    });

    expect((editorProps.current as { verses: unknown }).verses).toEqual([
      { verseNumber: 1, text: 'Drafted 1', markers: split },
      { verseNumber: 2, text: 'Drafted 2', markers: null },
    ]);
  });

  it('renders the title once and preserves it through scripture edits', () => {
    const title = { marker: 's1', text: 'My section title' };
    const secondary = { marker: 'r', text: 'A reference' };
    renderGroup({
      hasTitle: true,
      verses: [
        { verseNumber: 1, content: 'First verse', markers: { headings: [title, secondary] } },
        { verseNumber: 2, content: '' },
      ],
    });
    const props = editorProps.current as {
      verses: Array<{ markers: { headings: unknown[] } }>;
      onVersesChange: (changes: unknown[]) => void;
    };
    expect(props.verses[0].markers.headings).toEqual([secondary]);
    props.onVersesChange([
      {
        verseNumber: 1,
        text: 'Edited scripture',
        markers: { headings: [secondary], paragraphs: [{ marker: 'p', offset: 0 }] },
      },
    ]);
    expect(handleTextChange).toHaveBeenCalledWith(1, 'Edited scripture', {
      headings: [title, secondary],
      paragraphs: [{ marker: 'p', offset: 0 }],
    });
  });

  it('forwards editor markers to the save chain', () => {
    const split = {
      paragraphs: [
        { marker: 'p', offset: 0 },
        { marker: 'p', offset: 12 },
      ],
    };
    renderGroup();

    (
      editorProps.current as {
        onVersesChange: (changed: unknown[]) => void;
      }
    ).onVersesChange([{ verseNumber: 1, text: 'Split text.', markers: split }]);

    expect(handleTextChange).toHaveBeenCalledWith(1, 'Split text.', split);
  });

  it('keeps references and subtitles in the body when the title is empty', () => {
    const headings = [
      { marker: 'r', text: '(Matthew 1:1)' },
      { marker: 's2', text: 'A subtitle' },
    ];
    renderGroup({
      hasTitle: true,
      verses: [
        { verseNumber: 1, content: 'First verse', markers: { headings } },
        { verseNumber: 2, content: '' },
      ],
    });
    const props = editorProps.current as {
      verses: Array<{ markers: { headings: unknown[] } }>;
      onVersesChange: (changes: unknown[]) => void;
    };
    expect(props.verses[0].markers.headings).toEqual(headings);
    props.onVersesChange([{ verseNumber: 1, text: 'Edited scripture', markers: { headings } }]);
    expect(handleTextChange).toHaveBeenCalledWith(1, 'Edited scripture', { headings });
  });

  it('restores a section title after a leading reference without changing heading order', () => {
    const reference = { marker: 'r', text: '(Matthew 1:1)' };
    const title = { marker: 's1', text: 'My section title' };
    const subtitle = { marker: 's2', text: 'A subtitle' };
    renderGroup({
      hasTitle: true,
      verses: [
        {
          verseNumber: 1,
          content: 'First verse',
          markers: { headings: [reference, title, subtitle] },
        },
        { verseNumber: 2, content: '' },
      ],
    });
    const props = editorProps.current as {
      verses: Array<{ markers: { headings: unknown[] } }>;
      onVersesChange: (changes: unknown[]) => void;
    };
    expect(props.verses[0].markers.headings).toEqual([reference, subtitle]);
    const editedReference = { ...reference, text: '(Matthew 1:2)' };
    props.onVersesChange([
      {
        verseNumber: 1,
        text: 'Edited scripture',
        markers: { headings: [editedReference, subtitle] },
      },
    ]);
    expect(handleTextChange).toHaveBeenCalledWith(1, 'Edited scripture', {
      headings: [editedReference, title, subtitle],
    });
  });

  it.each(['generating', 'unavailable', 'error'] as const)(
    'does not show %s for an optional title on fully drafted scripture',
    status => {
      renderGroup({
        hasTitle: true,
        isAiActive: true,
        isAiThresholdMet: true,
        suggestionStatus: status,
      });
      expect(screen.queryByText('Generating...')).not.toBeInTheDocument();
      expect(screen.queryByText(/AI translation not/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next Pericope' })).toBeEnabled();
    }
  );
});
