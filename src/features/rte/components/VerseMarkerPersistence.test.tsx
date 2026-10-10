import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChapterEditor } from './ChapterEditor';
import { PericopeEditor } from './PericopeEditor';

import type { PericopeVerseText } from '../lib/pericope-usj';

// Lexical detects beforeinput support when imported. jsdom implements InputEvent but omits this
// browser API, so expose the empty-target fallback before the real editor module initializes.
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

const rows: PericopeVerseText[] = [
  {
    verseNumber: 1,
    text: 'આ પ્રથમ વચન છે.',
    markers: {
      headings: [{ marker: 's1', text: 'વિભાગનું શીર્ષક' }],
      paragraphs: [{ marker: 'p', offset: 0 }],
    },
  },
  { verseNumber: 2, text: 'આ બીજું વચન છે.', markers: null },
];

const props = { bookCode: 'GEN', chapterNumber: 1, targetLanguage: 'Gujarati' };
const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');

function verseText(input: HTMLElement, number: number): Text {
  return input.querySelector(`[data-marker="v"][data-number="${number}"]`)?.nextSibling
    ?.firstChild as Text;
}

async function select(
  input: HTMLElement,
  start: Node,
  offset: number,
  end = start,
  endOffset = offset
) {
  await act(async () => {
    input.focus();
    fireEvent(
      start.parentElement ?? input,
      new MouseEvent('pointerdown', { bubbles: true, button: 0 })
    );
    const range = document.createRange();
    range.setStart(start, offset);
    range.setEnd(end, endOffset);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    fireEvent(document, new Event('selectionchange'));
  });
}

function assertDocument(input: HTMLElement, expected: PericopeVerseText[]) {
  expect(
    Array.from(input.querySelectorAll('[data-marker="v"]'), verse =>
      verse.getAttribute('data-number')
    )
  ).toEqual(['1', '2']);
  expect(input.querySelector('[data-marker="s1"]')).toHaveTextContent('વિભાગનું શીર્ષક');
  expect(input.querySelector('[data-marker="s1"] [data-marker="v"]')).toBeNull();
  for (const row of expected)
    expect(verseText(input, row.verseNumber).textContent.trim()).toBe(row.text);
}

beforeEach(() => {
  vi.stubGlobal('DragEvent', class extends Event {});
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (rangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRect);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
});

// Exercise Editorial's real event handlers and USJ serialization. A DOM-only fixture cannot
// reveal a marker deletion that the editor subsequently saves under the neighboring verse.
describe.each([
  ['Chapter', ChapterEditor, PericopeEditor],
  ['Pericope', PericopeEditor, ChapterEditor],
] as const)('%s verse integrity', (_name, Editor, OtherEditor) => {
  it.each(['Backspace', 'Delete', 'deleteContent', 'range Delete', 'range replacement', 'cut'])(
    'keeps verse identities after %s at a marker, a normal edit, reload and view change',
    async deletion => {
      const onVersesChange = vi.fn<(changed: PericopeVerseText[]) => void>();
      const { container, rerender } = render(
        <Editor {...props} contentKey='initial' verses={rows} onVersesChange={onVersesChange} />
      );
      await waitFor(() =>
        expect(container.querySelector('.editor-input')).toHaveTextContent(rows[1].text)
      );
      let input = container.querySelector<HTMLElement>('.editor-input')!;
      const text = verseText(input, deletion === 'Backspace' ? 2 : 1);
      if (deletion.startsWith('range') || deletion === 'cut') {
        await select(input, text, 3, verseText(input, 2), 3);
      } else await select(input, text, deletion === 'Backspace' ? 0 : text.length);
      const event =
        deletion === 'deleteContent'
          ? new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: deletion })
          : deletion === 'range replacement'
            ? new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertReplacementText',
                data: 'બદલો',
              })
            : deletion === 'cut'
              ? new Event('cut', { bubbles: true, cancelable: true })
              : new KeyboardEvent('keydown', {
                  bubbles: true,
                  cancelable: true,
                  key: deletion === 'range Delete' ? 'Delete' : deletion,
                });
      await act(async () => {
        fireEvent(input, event);
      });
      expect(event.defaultPrevented).toBe(true);
      assertDocument(input, rows);
      expect(onVersesChange).not.toHaveBeenCalled();

      // A normal edit must still commit the original verse number and preserve its heading.
      const first = verseText(input, 1);
      await select(input, first, 0, first, first.length);
      expect(document.getSelection()!.toString()).toBe(first.data);
      fireEvent(
        input,
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertReplacementText',
          data: 'આ સુધારેલું વચન છે.',
        })
      );
      const saved = [{ ...rows[0], text: 'આ સુધારેલું વચન છે.' }, rows[1]];
      await waitFor(() => expect(onVersesChange).toHaveBeenLastCalledWith([saved[0]]));

      rerender(
        <Editor {...props} contentKey='reloaded' verses={saved} onVersesChange={onVersesChange} />
      );
      await waitFor(() =>
        assertDocument(container.querySelector<HTMLElement>('.editor-input')!, saved)
      );
      rerender(
        <OtherEditor
          {...props}
          contentKey='other-view'
          verses={saved}
          onVersesChange={onVersesChange}
        />
      );
      input = container.querySelector<HTMLElement>('.editor-input')!;
      await waitFor(() => assertDocument(input, saved));
      expect(onVersesChange).toHaveBeenCalledTimes(1);
    }
  );
});
