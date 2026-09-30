import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChapterEditor } from './ChapterEditor';
import { PericopeEditor } from './PericopeEditor';

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

describe.each([
  ['Chapter', ChapterEditor],
  ['Pericope', PericopeEditor],
] as const)('%s forward text deletion', (_name, Editor) => {
  it.each(
    ['કિ', 'ક્ષિ', 'कि', 'क्षि', 'é'].flatMap(cluster =>
      ['keydown', 'deleteContentForward', 'deleteContent'].map(
        inputType => [cluster, inputType] as const
      )
    )
  )(
    'deletes the complete browser-selected cluster %s through %s and reports the saved text',
    async (cluster, inputType) => {
      // jsdom has no caret navigation. Model the range supplied by the browser for one
      // forward character; real Chromium/Firefox contenteditable comparisons live in E2E.
      Object.defineProperty(Selection.prototype, 'modify', {
        configurable: true,
        value(this: Selection, alter: string, direction: string, granularity: string) {
          if (alter !== 'extend' || direction !== 'forward' || granularity !== 'character')
            throw new Error('Unexpected caret navigation in this fixture');
          this.extend(this.anchorNode!, 2 + cluster.length);
        },
      });
      const onVersesChange = vi.fn();
      const verses = [
        { verseNumber: 1, text: `A ${cluster} Z`, markers: null },
        { verseNumber: 2, text: 'Untouched verse.', markers: null },
      ];
      const { container } = render(
        <Editor
          bookCode='GEN'
          chapterNumber={1}
          contentKey='indic-deletion'
          targetLanguage='Gujarati'
          verses={verses}
          onVersesChange={onVersesChange}
        />
      );
      await waitFor(() =>
        expect(container.querySelector('.editor-input')).toHaveTextContent(verses[0].text)
      );
      const input = container.querySelector<HTMLElement>('.editor-input')!;
      const text = input.querySelector('[data-marker="v"][data-number="1"]')!.nextSibling!
        .firstChild as Text;
      await act(async () => {
        input.focus();
        fireEvent(text.parentElement!, new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        const range = document.createRange();
        range.setStart(text, 2);
        range.collapse(true);
        const selection = document.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        fireEvent(document, new Event('selectionchange'));
      });
      await act(async () => {
        if (inputType === 'keydown') fireEvent.keyDown(input, { key: 'Delete' });
        else
          fireEvent(
            input,
            new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType })
          );
      });
      await waitFor(() => expect(text.textContent.trim()).toBe('A  Z'));
      expect(onVersesChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ verseNumber: 1, text: 'A  Z' }),
      ]);
      expect(input).toHaveTextContent('Untouched verse.');
      expect(input.querySelectorAll('[data-marker="v"]')).toHaveLength(2);
    }
  );
});
