import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChapterEditor } from './ChapterEditor';
import { PericopeEditor } from './PericopeEditor';

// Lexical picks its beforeinput path at import time by probing InputEvent for getTargetRanges,
// which jsdom lacks, so the patch has to exist before Lexical loads.
const originalTargetRanges = vi.hoisted(() => {
  const original = Object.getOwnPropertyDescriptor(InputEvent.prototype, 'getTargetRanges');
  Object.defineProperty(InputEvent.prototype, 'getTargetRanges', {
    configurable: true,
    value: () => [],
  });
  return original;
});

afterAll(() => {
  if (originalTargetRanges)
    Object.defineProperty(InputEvent.prototype, 'getTargetRanges', originalTargetRanges);
  else Reflect.deleteProperty(InputEvent.prototype, 'getTargetRanges');
});

const originalModify = Object.getOwnPropertyDescriptor(Selection.prototype, 'modify');
const originalRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');

beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});
afterEach(() => {
  for (const [proto, key, descriptor] of [
    [Selection.prototype, 'modify', originalModify],
    [Range.prototype, 'getBoundingClientRect', originalRect],
    [Range.prototype, 'getClientRects', originalRects],
  ] as const) {
    if (descriptor) Object.defineProperty(proto, key, descriptor);
    else Reflect.deleteProperty(proto, key);
  }
});

const INPUT_TYPES = ['keydown', 'deleteContentForward', 'deleteContent'] as const;
type DeleteInput = (typeof INPUT_TYPES)[number];

/**
 * jsdom has no caret navigation. Model the range the browser supplies for one forward character;
 * real Chromium/Firefox contenteditable comparisons live in E2E.
 */
function modelForwardCharacter(focus: () => [Node, number]) {
  Object.defineProperty(Selection.prototype, 'modify', {
    configurable: true,
    value(this: Selection, alter: string, direction: string, granularity: string) {
      if (alter !== 'extend' || direction !== 'forward' || granularity !== 'character')
        throw new Error('Unexpected caret navigation in this fixture');
      this.extend(...focus());
    },
  });
}

async function renderVerse(Editor: typeof ChapterEditor | typeof PericopeEditor, text: string) {
  const onVersesChange = vi.fn();
  const { container } = render(
    <Editor
      bookCode='GEN'
      chapterNumber={1}
      contentKey='indic-deletion'
      targetLanguage='Gujarati'
      verses={[
        { verseNumber: 1, text, markers: null },
        { verseNumber: 2, text: 'Untouched verse.', markers: null },
      ]}
      onVersesChange={onVersesChange}
    />
  );
  await waitFor(() => expect(container.querySelector('.editor-input')).toHaveTextContent(text));
  const input = container.querySelector<HTMLElement>('.editor-input')!;
  const leaves = () =>
    [...input.querySelectorAll('[data-lexical-text]')].map(leaf => leaf.firstChild as Text);
  input.focus();
  return { input, leaves, onVersesChange };
}

/** Select like a click, so Lexical rebuilds its selection from the DOM even after formatting. */
async function select(node: Text, start: number, end = start) {
  await act(async () => {
    fireEvent(node.parentElement!, new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    fireEvent(document, new Event('selectionchange'));
  });
}

async function deleteForward(input: HTMLElement, inputType: DeleteInput, targetRange?: Range) {
  await act(async () => {
    if (inputType === 'keydown') {
      fireEvent.keyDown(input, { key: 'Delete' });
      return;
    }
    const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType });
    if (targetRange)
      Object.defineProperty(event, 'getTargetRanges', { value: () => [targetRange] });
    fireEvent(input, event);
  });
}

async function expectSavedVerse(
  input: HTMLElement,
  onVersesChange: ReturnType<typeof vi.fn>,
  text: string
) {
  await waitFor(() =>
    expect(onVersesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ verseNumber: 1, text }),
    ])
  );
  expect(input).toHaveTextContent('Untouched verse.');
  expect(input.querySelectorAll('[data-marker="v"]')).toHaveLength(2);
}

describe.each([
  ['Chapter', ChapterEditor],
  ['Pericope', PericopeEditor],
] as const)('%s forward text deletion', (_name, Editor) => {
  it.each(
    // Vowel signs, conjuncts, nasal marks, a ZWJ conjunct and a decomposed Latin accent, as
    // listed in #532. The ZWJ and the combining accent are escaped so they stay visible.
    ['કિ', 'ક્ષિ', 'कि', 'क्षि', 'કં', 'हँ', 'क्\u200dष', 'e\u0301'].flatMap(cluster =>
      INPUT_TYPES.map(inputType => [cluster, inputType] as const)
    )
  )(
    'deletes the complete browser-selected cluster %s through %s and reports the saved text',
    async (cluster, inputType) => {
      const { input, leaves, onVersesChange } = await renderVerse(Editor, `A ${cluster} Z`);
      const text = leaves()[0];
      modelForwardCharacter(() => [text, 2 + cluster.length]);
      await select(text, 2);
      await deleteForward(input, inputType);
      await waitFor(() => expect(text.textContent.trim()).toBe('A  Z'));
      await expectSavedVerse(input, onVersesChange, 'A  Z');
    }
  );

  it.each(
    [
      {
        name: 'a bold base letter before its vowel sign',
        bold: [2, 3],
        leaves: ['A ', 'ક', 'િ Z '],
        caret: [1, 0],
        focus: [2, 1],
      },
      {
        name: 'a bold cluster after the caret leaf',
        bold: [2, 4],
        leaves: ['A ', 'કિ', ' Z '],
        caret: [0, 2],
        focus: [1, 2],
      },
    ].flatMap(fixture => INPUT_TYPES.map(inputType => ({ ...fixture, inputType })))
  )(
    'deletes $name across text leaves through $inputType',
    async ({ bold, leaves: split, caret, focus, inputType }) => {
      // Formatting splits the verse into text leaves. Lexical only shrinks a range that stays
      // inside one text node, so the browser's cross-leaf range reaches it unchanged.
      const { input, leaves, onVersesChange } = await renderVerse(Editor, 'A કિ Z');
      await select(leaves()[0], bold[0], bold[1]);
      await act(async () => {
        fireEvent.keyDown(input, { key: 'b', ctrlKey: true });
      });
      await waitFor(() =>
        // The space before the next verse marker belongs to the verse's last leaf.
        expect(leaves().map(leaf => leaf.textContent)).toEqual([...split, 'Untouched verse.'])
      );

      const current = leaves();
      modelForwardCharacter(() => [current[focus[0]], focus[1]]);
      await select(current[caret[0]], caret[1]);
      // Browsers attach the same cross-leaf range to beforeinput.
      const dom = document.getSelection()!;
      const targetRange = document.createRange();
      targetRange.setStart(dom.anchorNode!, dom.anchorOffset);
      targetRange.setEnd(current[focus[0]], focus[1]);
      await deleteForward(input, inputType, targetRange);
      await waitFor(() =>
        expect(leaves().map(leaf => leaf.textContent)).toEqual(['A  Z ', 'Untouched verse.'])
      );
      await expectSavedVerse(input, onVersesChange, 'A  Z');
    }
  );
});
