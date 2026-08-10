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

/** The translator typing into one verse, committed the way the editor commits. */
const typeInto = (verseNumber: number, text: string): void => {
  const next = documentVerses().map(verse =>
    verse.verseNumber === verseNumber ? { ...verse, text } : verse
  );
  editor.usj = pericopeVersesToUsj(next, CHAPTER, BOOK);
  editor.commit?.(editor.usj);
};

const EMPTY_PAIR: PericopeVerseText[] = [
  { verseNumber: 1, text: '' },
  { verseNumber: 2, text: '' },
];

const WITH_SUGGESTION: PericopeVerseText[] = [
  { verseNumber: 1, text: 'AI suggestion' },
  { verseNumber: 2, text: '' },
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

    expect(documentVerses()).toEqual(WITH_SUGGESTION);
  });

  it('does not write an AI suggestion away on the next edit', () => {
    const onVersesChange = vi.fn();
    const props = { bookCode: BOOK, chapterNumber: CHAPTER, contentKey: 'a', onVersesChange };

    const { rerender } = render(<PericopeEditor {...props} verses={EMPTY_PAIR} />);
    rerender(<PericopeEditor {...props} verses={WITH_SUGGESTION} />);

    typeInto(2, 'Typed by hand.');

    // Verse 1 is not in the list: the editor never emptied it, so nothing about it is saved.
    expect(onVersesChange).toHaveBeenCalledWith([{ verseNumber: 2, text: 'Typed by hand.' }]);
  });

  it('leaves a verse the translator is writing in alone', () => {
    const props = { bookCode: BOOK, chapterNumber: CHAPTER, contentKey: 'a' };
    const drafted = [{ verseNumber: 1, text: 'Drafted text.' }];

    const { rerender } = render(
      <PericopeEditor {...props} verses={drafted} onVersesChange={vi.fn()} />
    );
    rerender(
      <PericopeEditor
        {...props}
        verses={[{ verseNumber: 1, text: 'Something else.' }]}
        onVersesChange={vi.fn()}
      />
    );

    expect(editor.setUsj).not.toHaveBeenCalled();
    expect(documentVerses()).toEqual(drafted);
  });

  it('reloads from the parent when the pericope identity changes', () => {
    const props = { bookCode: BOOK, chapterNumber: CHAPTER, onVersesChange: vi.fn() };
    const nextPericope = [{ verseNumber: 4, text: 'Fourth.' }];

    const { rerender } = render(
      <PericopeEditor {...props} contentKey='a' verses={[{ verseNumber: 1, text: 'First.' }]} />
    );
    rerender(<PericopeEditor {...props} contentKey='b' verses={nextPericope} />);

    expect(documentVerses()).toEqual(nextPericope);
  });
});
