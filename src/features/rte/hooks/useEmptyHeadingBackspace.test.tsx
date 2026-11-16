import { createRef, type RefObject } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '../lib/pericope-usj';

import { useEmptyHeadingBackspace } from './useEmptyHeadingBackspace';

import type { CaretLocation } from '../lib/verse-numbers';
import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';

// Enable the browser's beforeinput path before Editorial initializes in jsdom.
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

const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});
afterEach(() => {
  if (rangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRect);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
});

/** Verse 1 under a heading right after the chapter number; `title` is the heading's words. */
const rowsWith = (title: string): PericopeVerseText[] => [
  {
    verseNumber: 1,
    text: 'First verse.',
    markers: {
      headings: [{ marker: 's1', text: title }],
      paragraphs: [{ marker: 'p', offset: 0 }],
    },
  },
  { verseNumber: 2, text: 'Second verse.', markers: null },
];

/** What the save path keeps of `rowsWith('')`: an emptied heading is never stored. */
const savedWithoutHeading: PericopeVerseText[] = [
  { verseNumber: 1, text: 'First verse.', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
  { verseNumber: 2, text: 'Second verse.', markers: null },
];

function Harness({
  editorRef,
  usj,
  readOnly = false,
}: {
  editorRef: RefObject<EditorRef | null>;
  usj: Usj;
  readOnly?: boolean;
}) {
  const handleKeyDown = useEmptyHeadingBackspace(editorRef, readOnly);
  return (
    <div onKeyDownCapture={handleKeyDown}>
      <input aria-label='Outside editor' />
      <Editorial
        ref={editorRef}
        defaultUsj={usj}
        options={{ isReadonly: readOnly, hasExternalUI: true, hasSpellCheck: false }}
      />
    </div>
  );
}

async function setup(verses: PericopeVerseText[], readOnly = false) {
  const editorRef = createRef<EditorRef>();
  const rendered = render(
    <Harness
      editorRef={editorRef}
      readOnly={readOnly}
      usj={pericopeVersesToUsj(verses, 1, 'GEN')}
    />
  );
  await waitFor(() => expect(editorRef.current?.getUsj()).toBeTruthy());
  const input = rendered.container.querySelector<HTMLElement>('.editor-input')!;
  const place = async (jsonPath: CaretLocation['jsonPath'], offset = 0) => {
    act(() => {
      input.focus();
      editorRef.current!.setSelection({ start: { jsonPath, offset } });
    });
    await waitFor(() => expect(editorRef.current!.getSelection()?.start.jsonPath).toBe(jsonPath));
  };
  return { ...rendered, editorRef, input, place };
}

// Lexical's own Delete needs Selection.modify, which jsdom lacks, so these check what reaches the
// editor; the browser E2E checks the line goes and the chapter number and verse 1 stay.
describe('Backspace in an empty heading under the chapter number', () => {
  it.each([
    ['', {}],
    [' with Shift', { shiftKey: true }],
    [' with Ctrl', { ctrlKey: true }],
    [' with Alt', { altKey: true }],
  ])('becomes the editor Delete there%s, which removes the line', async (_, modifier) => {
    const { editorRef, input, place } = await setup(rowsWith(''));
    await place('$.content[1]');
    const applyUpdate = vi.spyOn(editorRef.current!, 'applyUpdate');
    const deletes: Array<string | undefined> = [];
    // Captured, so the caret is read before the editor acts on the key.
    input.addEventListener(
      'keydown',
      event => {
        if (event.key === 'Delete') deletes.push(editorRef.current!.getSelection()?.start.jsonPath);
      },
      true
    );

    const notPrevented = fireEvent.keyDown(input, { key: 'Backspace', ...modifier });

    expect(notPrevented).toBe(false);
    expect(deletes).toEqual(['$.content[1]']);
    expect(applyUpdate).not.toHaveBeenCalled();
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(savedWithoutHeading);
  });
});

describe('Backspace left to the editor', () => {
  async function expectUntouched(
    verses: PericopeVerseText[],
    jsonPath: CaretLocation['jsonPath'],
    event: KeyboardEventInit,
    readOnly = false
  ) {
    const { editorRef, input, place } = await setup(verses, readOnly);
    await place(jsonPath);
    const setSelection = vi.spyOn(editorRef.current!, 'setSelection');
    let deletes = 0;
    input.addEventListener('keydown', key => {
      if (key.key === 'Delete') deletes += 1;
    });
    fireEvent.keyDown(input, event);
    expect(setSelection).not.toHaveBeenCalled();
    // Only a Delete the translator pressed, none added.
    expect(deletes).toBe(event.key === 'Delete' ? 1 : 0);
  }

  it('in a heading with words, where the guard keeps them out of scripture', () =>
    expectUntouched(rowsWith('Title'), '$.content[1].content[0]', { key: 'Backspace' }));

  it('in an empty heading under a verse, which the editor removes itself', async () => {
    const verses: PericopeVerseText[] = [
      { verseNumber: 1, text: 'First verse.', markers: null },
      {
        verseNumber: 2,
        text: 'Second verse.',
        markers: {
          headings: [{ marker: 's1', text: '' }],
          paragraphs: [{ marker: 'p', offset: 0 }],
        },
      },
    ];
    await expectUntouched(verses, '$.content[2]', { key: 'Backspace' });
  });

  it('for Delete, which already removes the empty line', () =>
    expectUntouched(rowsWith(''), '$.content[1]', { key: 'Delete' }));

  it.each([
    { key: 'Backspace', isComposing: true },
    { key: 'Backspace', keyCode: 229, isComposing: false },
  ])('during a composition: %j', event => expectUntouched(rowsWith(''), '$.content[1]', event));

  it('in a read-only editor', () =>
    expectUntouched(rowsWith(''), '$.content[1]', { key: 'Backspace' }, true));

  it('for keys from other controls', async () => {
    const { editorRef, getByLabelText, place } = await setup(rowsWith(''));
    await place('$.content[1]');
    const setSelection = vi.spyOn(editorRef.current!, 'setSelection');
    fireEvent.keyDown(getByLabelText('Outside editor'), { key: 'Backspace' });
    expect(setSelection).not.toHaveBeenCalled();
  });
});
