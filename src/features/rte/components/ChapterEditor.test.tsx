import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import type { SerializedVerseRef } from '@sillsdev/scripture';

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
  focus: vi.fn<() => void>(),
  undo: vi.fn<() => void>(),
  redo: vi.fn<() => void>(),
  commit: undefined as ((usj: Usj) => void) | undefined,
  reportState: undefined as ((snapshot: StateChangeSnapshot) => void) | undefined,
  reportScrRef: undefined as ((scrRef: SerializedVerseRef) => void) | undefined,
  /** Every verse the editor has been asked to put the cursor in, in order. */
  askedForVerses: [] as number[],
}));

vi.mock('@eten-tech-foundation/platform-editor', async () => {
  const react = await import('react');

  interface StubProps {
    defaultUsj?: Usj;
    scrRef?: SerializedVerseRef;
    onScrRefChange?: (scrRef: SerializedVerseRef) => void;
    onStateChange?: (snapshot: StateChangeSnapshot) => void;
    onUsjChange?: (usj: Usj) => void;
  }

  return {
    Editorial: react.forwardRef<unknown, StubProps>(
      ({ defaultUsj, scrRef, onScrRefChange, onStateChange, onUsjChange }, ref) => {
        editor.usj ??= defaultUsj;
        editor.commit = onUsjChange;
        editor.reportState = onStateChange;
        editor.reportScrRef = onScrRefChange;

        // The real plugin places the cursor when the verse it is handed changes, and only then.
        const askedForVerse = scrRef?.verseNum;
        react.useEffect(() => {
          if (askedForVerse !== undefined) editor.askedForVerses.push(askedForVerse);
        }, [askedForVerse]);
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
            focus: editor.focus,
            getSelection: () => ({ start: { jsonPath: '$.content[1].content[0]', offset: 0 } }),
            getUsj: () => editor.usj,
            setSelection: vi.fn(),
            undo: editor.undo,
            redo: editor.redo,
            applyUpdate: () => {
              if (editor.usj) editor.commit?.(editor.usj);
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

const CHAPTER_PROPS = {
  bookCode: BOOK,
  chapterNumber: CHAPTER,
  contentKey: 'a',
  targetLanguage: 'Spanish',
};

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
    editor.askedForVerses = [];
    editor.setUsj.mockClear();
    editor.formatPara.mockClear();
    editor.focus.mockClear();
  });

  it('lays out as a header row and a body row its parent can place and frame', () => {
    render(
      <ChapterEditor
        {...CHAPTER_PROPS}
        bodyClassName='rounded-r-md border-y border-r'
        className='row-span-2 grid grid-rows-subgrid'
        verses={A_PAIR}
        onVersesChange={vi.fn()}
      />
    );
    const root = screen.getByTestId('chapter-editor');
    expect(root).toHaveClass('row-span-2', 'grid', 'grid-rows-subgrid');
    // Exactly two children, so a two-row subgrid puts the heading on the first row.
    expect(root.children).toHaveLength(2);
    const [header, body] = Array.from(root.children);
    expect(within(header as HTMLElement).getByRole('heading', { name: 'Spanish' })).toBeVisible();
    expect(header).not.toHaveClass('border-b');
    expect(body).toHaveClass('rounded-r-md', 'border-y', 'border-r');
    expect(body.querySelector('.chapter-editor-surface')).not.toBeNull();
  });

  it('fills its container on its own when no layout is given', () => {
    render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);
    const root = screen.getByTestId('chapter-editor');
    expect(root).toHaveClass('flex', 'h-full', 'flex-col');
    expect(root.children[1]).toHaveClass('min-h-0', 'flex-1');
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
    const props = { ...CHAPTER_PROPS, onVersesChange: vi.fn() };
    const nextChapter = [{ verseNumber: 1, text: 'A new chapter.', markers: null }];

    const { rerender } = render(<ChapterEditor {...props} contentKey='a' verses={A_PAIR} />);
    rerender(<ChapterEditor {...props} contentKey='b' verses={nextChapter} />);

    expect(documentVerses()).toEqual(inDocumentSpace(nextChapter));
  });

  describe('format bar', () => {
    it('labels the target pane in editable and read-only chapters', () => {
      const targetLanguage = 'Northern East Cree (Eastern dialect)';
      const props = { ...CHAPTER_PROPS, targetLanguage, verses: A_PAIR, onVersesChange: vi.fn() };
      const { rerender } = render(<ChapterEditor {...props} />);

      expect(screen.getByRole('heading', { name: targetLanguage })).toBeVisible();
      expect(screen.getByRole('heading', { name: targetLanguage })).toHaveAttribute(
        'title',
        targetLanguage
      );
      rerender(<ChapterEditor {...props} readOnly />);
      expect(screen.getByRole('heading', { name: targetLanguage })).toBeVisible();
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });

    it.each([false, true])(
      'updates the language after switching projects (readOnly=%s)',
      readOnly => {
        const props = { ...CHAPTER_PROPS, readOnly, verses: A_PAIR, onVersesChange: vi.fn() };
        const { rerender } = render(<ChapterEditor {...props} />);

        rerender(
          <ChapterEditor
            {...props}
            chapterNumber={12}
            contentKey='another-project/12'
            targetLanguage='हिन्दी'
          />
        );

        expect(screen.queryByRole('heading', { name: 'Spanish' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'हिन्दी' })).toBeVisible();
        expect(screen.getByRole('heading', { name: 'हिन्दी' })).toHaveAttribute('title', 'हिन्दी');
      }
    );

    it('keeps accessible names on contextual icon controls', async () => {
      const user = userEvent.setup();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      for (const name of ['Paragraph', 'Poetry Line', 'Section Heading', 'Insert paragraph']) {
        expect(screen.getByRole('button', { name })).toBeVisible();
        expect(screen.getByRole('button', { name })).toHaveTextContent(/^$/);
      }
      expect(screen.getByRole('button', { name: 'Section Heading' })).toBeDisabled();

      reportBlock('q2');
      for (const name of ['Decrease indent', 'Increase indent']) {
        expect(screen.getByRole('button', { name })).toBeVisible();
      }
      expect(screen.getByRole('button', { name: 'Increase indent' })).toBeDisabled();

      reportBlock('s2');
      await user.click(screen.getByRole('button', { name: 'Section Heading' }));
      for (const level of [1, 2, 3, 4]) {
        expect(screen.getByRole('menuitemradio', { name: `Level ${level}` })).toBeVisible();
      }
    });

    it('opens the heading levels from H and puts the caret back in the text after a pick', async () => {
      const user = userEvent.setup();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      reportBlock('s2');
      expect(screen.queryByRole('button', { name: /^Level/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Section Heading' }));
      expect(screen.getByRole('menuitemradio', { name: 'Level 2' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await user.click(screen.getByRole('menuitemradio', { name: 'Level 3' }));

      await waitFor(() => expect(editor.focus).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('keeps invalid heading edits visible and resumes saving after correction', async () => {
      const onVersesChange = vi.fn();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={onVersesChange} />);
      const document = (text: string): Usj => ({
        type: 'USJ',
        version: '3.1',
        content: [
          { type: 'para', marker: 's1', content: [text] },
          ...pericopeVersesToUsj(A_PAIR, CHAPTER, BOOK).content,
        ],
      });
      act(() => editor.commit?.(document('x'.repeat(301))));
      expect(screen.getByRole('alert')).toHaveTextContent('300');
      expect(onVersesChange).not.toHaveBeenCalled();
      act(() => editor.commit?.(document('Valid title')));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onVersesChange).toHaveBeenLastCalledWith([
        {
          ...A_PAIR[0],
          markers: {
            paragraphs: [{ marker: 'p', offset: 0 }],
            headings: [{ marker: 's1', text: 'Valid title' }],
          },
        },
      ]);
    });

    it('applies the block the translator picks to the editor', async () => {
      const user = userEvent.setup();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      reportBlock('p');
      await user.click(screen.getByRole('button', { name: 'Poetry Line' }));

      expect(editor.formatPara).toHaveBeenCalledWith('q1');
    });

    it('cancels heading insertion without changing scripture', async () => {
      const user = userEvent.setup();
      const onVersesChange = vi.fn();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={onVersesChange} />);
      act(() => editor.reportScrRef?.({ book: BOOK, chapterNum: CHAPTER, verseNum: 1 }));
      reportBlock('p');
      await user.click(screen.getByRole('button', { name: 'Section Heading' }));
      await user.type(screen.getByRole('textbox', { name: 'Heading text' }), 'Draft title');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onVersesChange).not.toHaveBeenCalled();
      expect(editor.setUsj).not.toHaveBeenCalled();
    });

    it('still reports a heading the cursor is already in', () => {
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      // A heading owns its text. Converting it to body prose would merge its words into a verse.
      reportBlock('s1');
      expect(screen.getByRole('button', { name: 'Section Heading' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.queryByTestId('other-block')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Paragraph' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Poetry Line' })).toBeDisabled();
    });

    it('keeps the level and indent controls with the block they belong to', () => {
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);
      const heading = () => screen.getByRole('button', { name: 'Section Heading' });

      reportBlock('p');
      expect(heading()).not.toHaveAttribute('aria-haspopup');
      expect(screen.queryByTestId('poetry-indent')).not.toBeInTheDocument();

      reportBlock('s2');
      expect(heading()).toHaveAttribute('aria-haspopup', 'menu');
      expect(heading()).toHaveAttribute('aria-pressed', 'true');

      reportBlock('q1');
      expect(heading()).not.toHaveAttribute('aria-haspopup');
      expect(screen.getByTestId('poetry-indent')).toBeInTheDocument();
    });

    it('indents a poetry line to the next level', async () => {
      const user = userEvent.setup();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      reportBlock('q1');
      await user.click(screen.getByRole('button', { name: 'Increase indent' }));

      expect(editor.formatPara).toHaveBeenCalledWith('q2');
    });

    it('keeps the block controls off until the editor has a cursor', async () => {
      const user = userEvent.setup();
      render(<ChapterEditor {...CHAPTER_PROPS} verses={A_PAIR} onVersesChange={vi.fn()} />);

      // Nothing reported, so nothing is selected and there is no block to format (#530 QA).
      const paragraph = () => screen.getByRole('button', { name: 'Paragraph' });
      const poetry = () => screen.getByRole('button', { name: 'Poetry Line' });
      expect(paragraph()).toBeDisabled();
      expect(paragraph()).toHaveAttribute('aria-pressed', 'false');
      expect(poetry()).toBeDisabled();
      await user.click(poetry());
      expect(editor.formatPara).not.toHaveBeenCalled();
      expect(screen.queryByTestId('poetry-indent')).not.toBeInTheDocument();

      reportBlock('p');
      expect(paragraph()).toBeEnabled();
      expect(paragraph()).toHaveAttribute('aria-pressed', 'true');
      await user.click(poetry());
      expect(editor.formatPara).toHaveBeenCalledWith('q1');
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

describe('history shortcuts (#427)', () => {
  it('Ctrl+Z and Ctrl+Y reach the editor as undo/redo commands', () => {
    editor.undo.mockClear();
    editor.redo.mockClear();
    const verses: PericopeVerseText[] = [
      { verseNumber: 1, text: 'In the beginning', markers: null },
    ];
    render(
      <ChapterEditor
        chapterNumber={CHAPTER}
        contentKey='history-shortcuts'
        targetLanguage='Spanish'
        verses={verses}
        onVersesChange={vi.fn()}
      />
    );
    fireEvent.keyDown(screen.getByTestId('chapter-editor'), { key: 'z', ctrlKey: true });
    expect(editor.undo).toHaveBeenCalledTimes(1);
    expect(editor.redo).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('chapter-editor'), {
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(editor.redo).toHaveBeenCalledTimes(1);
  });
});

describe('scoped block formatting (#427)', () => {
  beforeEach(() => {
    editor.usj = undefined;
    editor.commit = undefined;
    editor.reportState = undefined;
    editor.reportScrRef = undefined;
    editor.echoOnMount = true;
    editor.askedForVerses = [];
    editor.setUsj.mockClear();
    editor.formatPara.mockClear();
  });

  it('keeps the editor-native path when the active verse already is its own block', async () => {
    const scoped: PericopeVerseText[] = [
      { verseNumber: 1, text: 'First.', markers: null },
      { verseNumber: 2, text: 'Second.', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
      { verseNumber: 3, text: 'Third.', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
    ];
    render(<ChapterEditor {...CHAPTER_PROPS} verses={scoped} onVersesChange={vi.fn()} />);
    act(() => {
      editor.reportScrRef?.({ book: 'GEN', chapterNum: 1, verseNum: 2 });
      editor.reportState?.({
        canRedo: false,
        canUndo: false,
        blockMarker: 'p',
        contextMarker: undefined,
      });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Poetry Line' }));

    expect(editor.formatPara).toHaveBeenCalledWith('q1');
    expect(editor.setUsj).not.toHaveBeenCalled();
  });
});
