import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PericopeEditor } from '@/features/rte/components/PericopeEditor';
import {
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '@/features/rte/lib/pericope-usj';

import type { Usj } from '@eten-tech-foundation/scripture-utilities';

/**
 * The real editor is a Lexical surface, but the contract under test is the wrapper's: what reaches
 * the document, and what is reported back out of it. So the stand-in keeps a document — an editor
 * that forgot everything pushed into it would hide exactly the bug these tests are about.
 */
const editor = vi.hoisted(() => ({
  usj: undefined as Usj | undefined,
  setUsj: vi.fn<(usj: Usj) => void>(),
  commit: undefined as ((usj: Usj) => void) | undefined,
}));

vi.mock('@eten-tech-foundation/platform-editor', async () => {
  const react = await import('react');

  return {
    Editorial: react.forwardRef<unknown, { defaultUsj?: Usj; onUsjChange?: (usj: Usj) => void }>(
      ({ defaultUsj, onUsjChange }, ref) => {
        editor.usj ??= defaultUsj;
        editor.commit = onUsjChange;
        react.useImperativeHandle(
          ref,
          () => ({
            setUsj: (usj: Usj) => {
              editor.usj = usj;
              editor.setUsj(usj);
            },
          }),
          []
        );
        return react.createElement('div', { 'data-testid': 'editorial' });
      }
    ),
  };
});

const CHAPTER = 1;
const BOOK = 'GEN';

/** What the editor's document holds right now. */
const documentVerses = (): PericopeVerseText[] => usjToPericopeVerses(editor.usj as Usj);

/**
 * What verse rows look like after a trip through the editor's document: the first verse of a
 * paragraph gains its explicit `{marker, offset: 0}`, everything else is unchanged. Assertions
 * compare against this because the component mirrors the document, not the raw rows.
 */
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

const EMPTY_PAIR: PericopeVerseText[] = [
  { verseNumber: 1, text: '', markers: null },
  { verseNumber: 2, text: '', markers: null },
];

const WITH_SUGGESTION: PericopeVerseText[] = [
  { verseNumber: 1, text: 'AI suggestion', markers: null },
  { verseNumber: 2, text: '', markers: null },
];

describe('PericopeEditor', () => {
  beforeEach(() => {
    editor.usj = undefined;
    editor.commit = undefined;
    editor.setUsj.mockClear();
  });

  it('shows text the parent wrote into a verse the editor holds empty', () => {
    const props = { bookCode: BOOK, chapterNumber: CHAPTER, contentKey: 'a' };
    const { rerender } = render(
      <PericopeEditor {...props} verses={EMPTY_PAIR} onVersesChange={vi.fn()} />
    );

    // What the drafting surface does when the AI suggestion for verse 1 arrives.
    rerender(<PericopeEditor {...props} verses={WITH_SUGGESTION} onVersesChange={vi.fn()} />);

    expect(documentVerses()).toEqual(inDocumentSpace(WITH_SUGGESTION));
  });

  it('does not write an AI suggestion away on the next edit', () => {
    const onVersesChange = vi.fn();
    const props = { bookCode: BOOK, chapterNumber: CHAPTER, contentKey: 'a', onVersesChange };

    const { rerender } = render(<PericopeEditor {...props} verses={EMPTY_PAIR} />);
    rerender(<PericopeEditor {...props} verses={WITH_SUGGESTION} />);

    typeInto(2, 'Typed by hand.');

    // Verse 1 is not in the list: the editor never emptied it, so nothing about it is saved.
    expect(onVersesChange).toHaveBeenCalledWith([
      { verseNumber: 2, text: 'Typed by hand.', markers: null },
    ]);
  });

  it('leaves a verse the translator is writing in alone', () => {
    const props = { bookCode: BOOK, chapterNumber: CHAPTER, contentKey: 'a' };
    const drafted = [{ verseNumber: 1, text: 'Drafted text.', markers: null }];

    const { rerender } = render(
      <PericopeEditor {...props} verses={drafted} onVersesChange={vi.fn()} />
    );
    rerender(
      <PericopeEditor
        {...props}
        verses={[{ verseNumber: 1, text: 'Something else.', markers: null }]}
        onVersesChange={vi.fn()}
      />
    );

    expect(editor.setUsj).not.toHaveBeenCalled();
    expect(documentVerses()).toEqual(inDocumentSpace(drafted));
  });

  it('populates the pericope progressively as each verse suggestion arrives', () => {
    const props = {
      bookCode: BOOK,
      chapterNumber: CHAPTER,
      contentKey: 'a',
      onVersesChange: vi.fn(),
    };
    const pericope: PericopeVerseText[] = [
      { verseNumber: 1, text: '', markers: null },
      { verseNumber: 2, text: '', markers: null },
      { verseNumber: 3, text: '', markers: null },
      { verseNumber: 4, text: '', markers: null },
    ];

    const { rerender } = render(<PericopeEditor {...props} verses={pericope} />);

    // Generation runs three verses ahead, so the first three land together.
    const firstThree = pericope.map((verse, index) =>
      index < 3 ? { ...verse, text: `Suggestion ${verse.verseNumber}` } : verse
    );
    rerender(<PericopeEditor {...props} verses={firstThree} />);

    expect(documentVerses()).toEqual(inDocumentSpace(firstThree));

    // Then verse 4 becomes available on its own and shows up in the same surface.
    const andTheFourth = firstThree.map(verse =>
      verse.verseNumber === 4 ? { ...verse, text: 'Suggestion 4' } : verse
    );
    rerender(<PericopeEditor {...props} verses={andTheFourth} />);

    expect(documentVerses()).toEqual(inDocumentSpace(andTheFourth));
  });

  it('keeps text the translator wrote when a later verse populates around it', () => {
    const props = {
      bookCode: BOOK,
      chapterNumber: CHAPTER,
      contentKey: 'a',
      onVersesChange: vi.fn(),
    };

    const { rerender } = render(<PericopeEditor {...props} verses={EMPTY_PAIR} />);

    typeInto(1, 'Drafted by hand.');
    rerender(
      <PericopeEditor
        {...props}
        verses={[
          { verseNumber: 1, text: 'Drafted by hand.', markers: null },
          { verseNumber: 2, text: 'Suggestion 2', markers: null },
        ]}
      />
    );

    expect(documentVerses()).toEqual(
      inDocumentSpace([
        { verseNumber: 1, text: 'Drafted by hand.', markers: null },
        { verseNumber: 2, text: 'Suggestion 2', markers: null },
      ])
    );
  });

  it('reloads from the parent when the pericope identity changes', () => {
    const props = { bookCode: BOOK, chapterNumber: CHAPTER, onVersesChange: vi.fn() };
    const nextPericope = [{ verseNumber: 4, text: 'Fourth.', markers: null }];

    const { rerender } = render(
      <PericopeEditor
        {...props}
        contentKey='a'
        verses={[{ verseNumber: 1, text: 'First.', markers: null }]}
      />
    );
    rerender(<PericopeEditor {...props} contentKey='b' verses={nextPericope} />);

    expect(documentVerses()).toEqual(inDocumentSpace(nextPericope));
  });

  it('does not report the editor mount echo as a markers change', () => {
    const onVersesChange = vi.fn();
    render(
      <PericopeEditor
        bookCode={BOOK}
        chapterNumber={CHAPTER}
        contentKey='a'
        verses={[{ verseNumber: 1, text: 'Text.', markers: null }]}
        onVersesChange={onVersesChange}
      />
    );

    // The editor commits the document it was mounted with, as editors do.
    editor.commit?.(editor.usj as Usj);

    expect(onVersesChange).not.toHaveBeenCalled();
  });

  it('reports a paragraph split with its markers', () => {
    const onVersesChange = vi.fn();
    render(
      <PericopeEditor
        bookCode={BOOK}
        chapterNumber={CHAPTER}
        contentKey='a'
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

  it('does not re-report a split the editor merely re-echoes', () => {
    const onVersesChange = vi.fn();
    render(
      <PericopeEditor
        bookCode={BOOK}
        chapterNumber={CHAPTER}
        contentKey='a'
        verses={[{ verseNumber: 1, text: 'Starts here and continues here.', markers: null }]}
        onVersesChange={onVersesChange}
      />
    );

    const split = (secondPara: string): Usj =>
      ({
        type: 'USJ',
        version: '3.1',
        content: [
          { type: 'chapter', marker: 'c', number: '1' },
          {
            type: 'para',
            marker: 'p',
            content: [{ type: 'verse', marker: 'v', number: '1', sid: 'GEN 1:1' }, 'Starts here'],
          },
          { type: 'para', marker: 'p', content: [secondPara] },
        ],
      }) as Usj;

    editor.commit?.(split('and continues here.'));
    // Same document, different serialization (the trailing structural space trims away).
    editor.commit?.(split('and continues here. '));

    expect(onVersesChange).toHaveBeenCalledTimes(1);
  });
});
