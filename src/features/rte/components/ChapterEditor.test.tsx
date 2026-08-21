import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChapterEditor } from '@/features/rte/components/ChapterEditor';
import {
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '@/features/rte/lib/pericope-usj';

import type { StateChangeSnapshot } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';

/**
 * The document-keeping stand-in `PericopeEditor.test.tsx` uses, plus the two things chapter view
 * adds: `formatPara` on the ref, and the `onStateChange` channel the format bar reads.
 *
 * `echoOnMount` is the knob worth having. An editor commits the document it was mounted with, and
 * a child's effect runs before its parent's, so that commit can land while the wrapper has done
 * nothing but render. The wrapper has to hold a usable diff baseline either way, so both editors
 * are exercised: the one that announces itself and the one that waits to be typed in.
 */
const editor = vi.hoisted(() => ({
  usj: undefined as Usj | undefined,
  echoOnMount: true,
  setUsj: vi.fn<(usj: Usj) => void>(),
  formatPara: vi.fn<(marker: string) => void>(),
  commit: undefined as ((usj: Usj) => void) | undefined,
  reportState: undefined as ((snapshot: StateChangeSnapshot) => void) | undefined,
}));

vi.mock('@eten-tech-foundation/platform-editor', async () => {
  const react = await import('react');

  interface StubProps {
    defaultUsj?: Usj;
    onStateChange?: (snapshot: StateChangeSnapshot) => void;
    onUsjChange?: (usj: Usj) => void;
  }

  return {
    Editorial: react.forwardRef<unknown, StubProps>(
      ({ defaultUsj, onStateChange, onUsjChange }, ref) => {
        editor.usj ??= defaultUsj;
        editor.commit = onUsjChange;
        editor.reportState = onStateChange;
        react.useImperativeHandle(
          ref,
          () => ({
            setUsj: (usj: Usj) => {
              editor.usj = usj;
              editor.setUsj(usj);
            },
            formatPara: (marker: string) => {
              editor.formatPara(marker);
            },
          }),
          []
        );

        const echoed = react.useRef(false);
        react.useEffect(() => {
          if (echoed.current || !editor.echoOnMount || !editor.usj) return;
          echoed.current = true;
          onUsjChange?.(editor.usj);
        }, [onUsjChange]);

        return react.createElement('div', { 'data-testid': 'editorial' });
      }
    ),
  };
});

const CHAPTER = 1;
const BOOK = 'GEN';

/** What the editor's document holds right now. */
const documentVerses = (): PericopeVerseText[] => usjToPericopeVerses(editor.usj as Usj);

/** Verse rows after a trip through the editor's document, which is what the component mirrors. */
const inDocumentSpace = (verses: PericopeVerseText[]): PericopeVerseText[] =>
  usjToPericopeVerses(pericopeVersesToUsj(verses, CHAPTER, BOOK));

/** The translator typing into one verse, committed the way the editor commits. */
const typeInto = (verseNumber: number, text: string): void => {
  const next = documentVerses().map(verse =>
    verse.verseNumber === verseNumber ? { ...verse, text } : verse
  );
  editor.usj = pericopeVersesToUsj(next, CHAPTER, BOOK);
  editor.commit?.(editor.usj);
};

/** The editor telling the bar which block the cursor landed in. */
const reportBlock = (blockMarker: string | undefined): void => {
  act(() => {
    editor.reportState?.({ canRedo: false, canUndo: false, blockMarker, contextMarker: undefined });
  });
};

const CHAPTER_PROPS = { bookCode: BOOK, chapterNumber: CHAPTER, contentKey: 'a' };

const EMPTY_PAIR: PericopeVerseText[] = [
  { verseNumber: 1, text: '', markers: null },
  { verseNumber: 2, text: '', markers: null },
];

const WITH_SUGGESTION: PericopeVerseText[] = [
  { verseNumber: 1, text: 'AI suggestion', markers: null },
  { verseNumber: 2, text: '', markers: null },
];

const A_PAIR: PericopeVerseText[] = [
  { verseNumber: 1, text: 'First.', markers: null },
  { verseNumber: 2, text: 'Second.', markers: null },
];

describe('ChapterEditor', () => {
  beforeEach(() => {
    editor.usj = undefined;
    editor.commit = undefined;
    editor.reportState = undefined;
    editor.echoOnMount = true;
    editor.setUsj.mockClear();
    editor.formatPara.mockClear();
  });

  it('does not report the editor mount echo as a change', () => {
    const onVersesChange = vi.fn();
    render(
      <ChapterEditor
        {...CHAPTER_PROPS}
        verses={[{ verseNumber: 1, text: 'Text.', markers: null }]}
        onVersesChange={onVersesChange}
      />
    );

    // The stand-in committed the mounted document from its own effect; commit it once more, the
    // way an editor that waits until it has settled would.
    editor.commit?.(editor.usj as Usj);

    expect(onVersesChange).not.toHaveBeenCalled();
  });

  it('reports a paragraph split with its markers', () => {
    const onVersesChange = vi.fn();
    render(
      <ChapterEditor
        {...CHAPTER_PROPS}
        verses={[{ verseNumber: 1, text: 'Starts here and continues here.', markers: null }]}
        onVersesChange={onVersesChange}
      />
    );

    // The translator presses Enter mid-verse: the editor emits a second paragraph.
    editor.commit?.({
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: '1' },
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '1', sid: 'GEN 1:1' }, 'Starts here'],
        },
        { type: 'para', marker: 'p', content: ['and continues here.'] },
      ],
    } as Usj);

    expect(onVersesChange).toHaveBeenCalledWith([
      {
        verseNumber: 1,
        text: 'Starts here and continues here.',
        markers: {
          paragraphs: [
            { marker: 'p', offset: 0 },
            { marker: 'p', offset: 12 },
          ],
        },
      },
    ]);
  });

  it('carries a block the translator applied out as the verse markers', () => {
    const onVersesChange = vi.fn();
    render(
      <ChapterEditor
        {...CHAPTER_PROPS}
        verses={[
          { verseNumber: 1, text: 'A line of poetry.', markers: null },
          { verseNumber: 2, text: 'Prose again.', markers: null },
        ]}
        onVersesChange={onVersesChange}
      />
    );

    // What the editor's document looks like after `formatPara('q1')` on verse 2's paragraph.
    editor.commit?.({
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: '1' },
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: 'GEN 1:1' },
            'A line of poetry.',
          ],
        },
        {
          type: 'para',
          marker: 'q1',
          content: [{ type: 'verse', marker: 'v', number: '2', sid: 'GEN 1:2' }, 'Prose again.'],
        },
      ],
    } as Usj);

    expect(onVersesChange).toHaveBeenCalledWith([
      {
        verseNumber: 2,
        text: 'Prose again.',
        markers: { paragraphs: [{ marker: 'q1', offset: 0 }] },
      },
    ]);
  });

  it('shows text the parent wrote into a verse the editor holds empty', () => {
    const { rerender } = render(
      <ChapterEditor {...CHAPTER_PROPS} verses={EMPTY_PAIR} onVersesChange={vi.fn()} />
    );

    // What the drafting surface does when the AI suggestion for verse 1 arrives.
    rerender(
      <ChapterEditor {...CHAPTER_PROPS} verses={WITH_SUGGESTION} onVersesChange={vi.fn()} />
    );

    expect(documentVerses()).toEqual(inDocumentSpace(WITH_SUGGESTION));
  });

  it('does not write an AI suggestion away on the next edit', () => {
    const onVersesChange = vi.fn();
    const props = { ...CHAPTER_PROPS, onVersesChange };

    const { rerender } = render(<ChapterEditor {...props} verses={EMPTY_PAIR} />);
    rerender(<ChapterEditor {...props} verses={WITH_SUGGESTION} />);

    typeInto(2, 'Typed by hand.');

    // Verse 1 is not in the list: the editor never emptied it, so nothing about it is saved.
    expect(onVersesChange).toHaveBeenCalledWith([
      { verseNumber: 2, text: 'Typed by hand.', markers: null },
    ]);
  });

  it('leaves a verse the translator is writing in alone', () => {
    const drafted = [{ verseNumber: 1, text: 'Drafted text.', markers: null }];

    const { rerender } = render(
      <ChapterEditor {...CHAPTER_PROPS} verses={drafted} onVersesChange={vi.fn()} />
    );
    rerender(
      <ChapterEditor
        {...CHAPTER_PROPS}
        verses={[{ verseNumber: 1, text: 'Something else.', markers: null }]}
        onVersesChange={vi.fn()}
      />
    );

    expect(editor.setUsj).not.toHaveBeenCalled();
    expect(documentVerses()).toEqual(inDocumentSpace(drafted));
  });

  it('reloads from the parent when the chapter identity changes', () => {
    const props = { bookCode: BOOK, chapterNumber: CHAPTER, onVersesChange: vi.fn() };
    const nextChapter = [{ verseNumber: 1, text: 'A new chapter.', markers: null }];

    const { rerender } = render(<ChapterEditor {...props} contentKey='a' verses={A_PAIR} />);
    rerender(<ChapterEditor {...props} contentKey='b' verses={nextChapter} />);

    expect(documentVerses()).toEqual(inDocumentSpace(nextChapter));
  });

  describe('format bar', () => {
    it('applies the block the translator picks to the editor', async () => {
      const user = userEvent.setup();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      reportBlock('p');
      await user.click(screen.getByRole('button', { name: 'Section Heading' }));

      expect(editor.formatPara).toHaveBeenCalledWith('s1');
    });

    it('keeps the level and indent controls with the block they belong to', () => {
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      reportBlock('p');
      expect(screen.queryByTestId('heading-levels')).not.toBeInTheDocument();
      expect(screen.queryByTestId('poetry-indent')).not.toBeInTheDocument();

      reportBlock('s2');
      expect(screen.getByTestId('heading-levels')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-pressed', 'true');

      reportBlock('q1');
      expect(screen.queryByTestId('heading-levels')).not.toBeInTheDocument();
      expect(screen.getByTestId('poetry-indent')).toBeInTheDocument();
    });

    it('indents a poetry line to the next level', async () => {
      const user = userEvent.setup();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      reportBlock('q1');
      await user.click(screen.getByRole('button', { name: 'Increase indent' }));

      expect(editor.formatPara).toHaveBeenCalledWith('q2');
    });

    it('does not claim a block the editor had no cursor to apply', async () => {
      const user = userEvent.setup();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      // Nothing reported, so nothing is selected and `formatPara` has nothing to act on. The
      // editor is still asked, but the bar must not sit there claiming a block that never took.
      await user.click(screen.getByRole('button', { name: 'Section Heading' }));

      expect(editor.formatPara).toHaveBeenCalledWith('s1');
      expect(screen.queryByTestId('heading-levels')).not.toBeInTheDocument();
    });

    it('says so when the cursor is in a block it cannot author', () => {
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      // A major section head and an imported poetry level the bar does not write. Three unpressed
      // buttons would read as "no formatting here", which is the one thing this block is not.
      for (const marker of ['ms1', 'q3']) {
        reportBlock(marker);
        expect(screen.getByTestId('other-block')).toHaveTextContent('Other');
        expect(screen.getByRole('button', { name: 'Paragraph' })).toHaveAttribute(
          'aria-pressed',
          'false'
        );
        expect(screen.queryByTestId('poetry-indent')).not.toBeInTheDocument();
      }

      reportBlock('p');
      expect(screen.queryByTestId('other-block')).not.toBeInTheDocument();
    });

    it('is not offered when the chapter is read only', () => {
      render(
        <ChapterEditor {...CHAPTER_PROPS} readOnly verses={A_PAIR} onVersesChange={vi.fn()} />
      );

      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });
  });

  describe('with an editor that stays quiet until it is typed in', () => {
    beforeEach(() => {
      editor.echoOnMount = false;
    });

    it('still has a diff baseline for the first edit', () => {
      const onVersesChange = vi.fn();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={onVersesChange} />);

      typeInto(2, 'Second, edited.');

      expect(onVersesChange).toHaveBeenCalledWith([
        { verseNumber: 2, text: 'Second, edited.', markers: null },
      ]);
    });

    it('still shows text the parent wrote into a verse it holds empty', () => {
      const { rerender } = render(
        <ChapterEditor {...CHAPTER_PROPS} verses={EMPTY_PAIR} onVersesChange={vi.fn()} />
      );
      rerender(
        <ChapterEditor {...CHAPTER_PROPS} verses={WITH_SUGGESTION} onVersesChange={vi.fn()} />
      );

      expect(documentVerses()).toEqual(inDocumentSpace(WITH_SUGGESTION));
    });
  });
});
