import { createRef, type RefObject } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '../lib/pericope-usj';

import { useHeadingEnter } from './useHeadingEnter';
import { useVerseNumberKeys } from './useVerseNumberKeys';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';

type OffsetLocation = Extract<
  NonNullable<ReturnType<EditorRef['getSelection']>>['start'],
  { offset: number }
>;

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

const heading = { marker: 's1', text: 'Title' };
const rows: PericopeVerseText[] = [
  { verseNumber: 1, text: 'First verse.', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
  {
    verseNumber: 2,
    text: 'Second verse.',
    markers: { headings: [heading], paragraphs: [{ marker: 'p', offset: 0 }] },
  },
];

const withVerseTwo = (markers: PericopeVerseText['markers']): PericopeVerseText[] =>
  rows.map(row => (row.verseNumber === 2 ? { ...row, markers } : row));

// The same key and paste wiring ChapterEditor and PericopeEditor use.
function Harness({
  editorRef,
  usj,
  readOnly = false,
  onUsjChange,
}: {
  editorRef: RefObject<EditorRef | null>;
  usj: Usj;
  readOnly?: boolean;
  onUsjChange: (usj: Usj) => void;
}) {
  const handleHeadingEnter = useHeadingEnter(editorRef, readOnly);
  const verseKeys = useVerseNumberKeys(editorRef, readOnly);
  return (
    <div
      onKeyDownCapture={event => {
        if (!handleHeadingEnter(event)) verseKeys.handleKeyDown(event);
      }}
      onPasteCapture={verseKeys.handlePaste}
    >
      <Editorial
        ref={editorRef}
        defaultUsj={usj}
        options={{ isReadonly: readOnly, hasExternalUI: true, hasSpellCheck: false }}
        onUsjChange={onUsjChange}
      />
    </div>
  );
}

async function setup(usj: Usj, readOnly = false) {
  const editorRef = createRef<EditorRef>();
  const onUsjChange = vi.fn();
  const rendered = render(<Harness {...{ editorRef, usj, readOnly, onUsjChange }} />);
  await waitFor(() => expect(editorRef.current?.getUsj()).toBeTruthy());
  const input = rendered.container.querySelector<HTMLElement>('.editor-input')!;
  const editor = editorRef.current!;
  const select = async (jsonPath: OffsetLocation['jsonPath'], offset: number) => {
    act(() => editor.setSelection({ start: { jsonPath, offset } }));
    await waitFor(() => expect(editor.getSelection()?.start.jsonPath).toBe(jsonPath));
  };
  /** Each top-level block as "marker: content", verse numbers as [n]. */
  const blocks = () =>
    editor.getUsj()!.content.map(node => {
      if (typeof node === 'string') return node;
      if (node.type === 'chapter') return `c: ${node.number}`;
      const content = (node.content ?? [])
        .map(child => (typeof child === 'string' ? child : `[${child.number}]`))
        .join('');
      return `${node.marker}: ${content}`;
    });
  return { ...rendered, editor, input, onUsjChange, select, blocks };
}

const typeText = (input: HTMLElement, data: string) =>
  fireEvent(
    input,
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertReplacementText',
      data,
    })
  );

describe('verse numbers stay with their text in the real editor', () => {
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

  describe('Enter right after a verse number', () => {
    it('moves the number down with its text', async () => {
      const verses = rows.map(row => ({
        ...row,
        markers: row.verseNumber === 1 ? row.markers : null,
      }));
      const { editor, input, select, blocks } = await setup(pericopeVersesToUsj(verses, 1, 'GEN'));
      expect(blocks()).toEqual(['c: 1', 'p: [1]First verse.[2]Second verse.']);
      await select('$.content[1].content[3]', 0);
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(blocks()).toHaveLength(3));
      expect(blocks()[2]).toBe('p: [2]Second verse.');
      expect(usjToPericopeVerses(editor.getUsj()!)[1]).toEqual({
        verseNumber: 2,
        text: 'Second verse.',
        markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
      });
      expect(editor.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[2\]/);
    });

    it('opens a line above a verse that starts its block, in the same format', async () => {
      const verses = withVerseTwo({ paragraphs: [{ marker: 'q2', offset: 0 }] });
      const { editor, input, select, blocks } = await setup(pericopeVersesToUsj(verses, 1, 'GEN'));
      await select('$.content[2].content[1]', 0);
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(blocks()).toHaveLength(4));
      expect(blocks().slice(2)).toEqual(['q2: ', 'q2: [2]Second verse.']);
      // A line holding no words is not stored.
      expect(usjToPericopeVerses(editor.getUsj()!)).toEqual(verses);
      expect(editor.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[3\]/);
    });

    it('splits after a word space, so the space stays on the line above', async () => {
      // Editorial drops the space a new paragraph starts with; a later merge would glue the words.
      const { editor, input, select, blocks } = await setup(pericopeVersesToUsj(rows, 1, 'GEN'));
      await select('$.content[3].content[1]', 6);
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(blocks()).toHaveLength(5));
      expect(blocks().slice(3)).toEqual(['p: [2]Second ', 'p: verse.']);
      expect(usjToPericopeVerses(editor.getUsj()!)[1].text).toBe('Second verse.');
      expect(editor.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[4\]/);
    });

    it('leaves Enter inside the verse text to the editor', async () => {
      const { editor, input, select } = await setup(pericopeVersesToUsj(rows, 1, 'GEN'));
      await select('$.content[3].content[1]', 6);
      const applyUpdate = vi.spyOn(editor, 'applyUpdate');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(applyUpdate).not.toHaveBeenCalled();
    });
  });

  describe('typing in the new paragraph under a heading', () => {
    async function openUnderHeading(verses = rows) {
      const view = await setup(pericopeVersesToUsj(verses, 1, 'GEN'));
      await view.select('$.content[2].content[0]', 5);
      fireEvent.keyDown(view.input, { key: 'Enter' });
      await waitFor(() => expect(view.blocks()[3]).toBe('p: '));
      return view;
    }

    it('brings the verse number in with the first letter', async () => {
      const { editor, input, blocks, container } = await openUnderHeading();
      const event = fireEvent.keyDown(input, { key: 'N' });
      expect(event).toBe(false);
      await waitFor(() => expect(blocks()[3]).toBe('p: [2]N  '));
      expect(blocks()[4]).toBe('p: Second verse.');
      expect(container.querySelectorAll('[data-marker="v"]')).toHaveLength(2);
      expect(usjToPericopeVerses(editor.getUsj()!)[1]).toEqual({
        verseNumber: 2,
        text: 'N Second verse.',
        markers: {
          headings: [heading],
          paragraphs: [
            { marker: 'p', offset: 0 },
            { marker: 'p', offset: 2 },
          ],
        },
      });
    });

    it('keeps typing after the first letter, and saves the words with the verse', async () => {
      const { input, blocks, onUsjChange } = await openUnderHeading();
      fireEvent.keyDown(input, { key: 'N' });
      await waitFor(() => expect(blocks()[3]).toBe('p: [2]N  '));
      typeText(input, 'ew words');
      await waitFor(() => expect(blocks()[3]).toBe('p: [2]New words  '));
      await waitFor(() =>
        expect(usjToPericopeVerses(onUsjChange.mock.lastCall![0])[1].text).toBe(
          'New words Second verse.'
        )
      );
    });

    it('takes the number and the first letter back in one undo', async () => {
      const { editor, input, blocks } = await openUnderHeading();
      fireEvent.keyDown(input, { key: 'N' });
      await waitFor(() => expect(blocks()[3]).toBe('p: [2]N  '));
      act(() => editor.undo());
      await waitFor(() => expect(blocks().slice(3)).toEqual(['p: ', 'p: [2]Second verse.']));
      act(() => editor.redo());
      await waitFor(() => expect(blocks().slice(3)).toEqual(['p: [2]N  ', 'p: Second verse.']));
    });

    it('brings the number in before an IME composition starts, without typing for it', async () => {
      const { input, blocks } = await openUnderHeading();
      const event = fireEvent.keyDown(input, { key: 'Process', keyCode: 229 });
      expect(event).toBe(true);
      await waitFor(() => expect(blocks().slice(3)).toEqual(['p: [2]  ', 'p: Second verse.']));
    });

    it.each([
      { key: 'ArrowDown' },
      { key: 'Shift' },
      { key: ' ' },
      { key: 'a', ctrlKey: true },
      { key: 'Tab' },
      { key: 'N', isComposing: true },
    ])('leaves the number where it is for %j', async keyEvent => {
      const { input, blocks } = await openUnderHeading();
      fireEvent.keyDown(input, keyEvent);
      expect(blocks().slice(3)).toEqual(['p: ', 'p: [2]Second verse.']);
    });

    it('keeps the Poetry format of the verse line below', async () => {
      const verses = withVerseTwo({
        headings: [heading],
        paragraphs: [{ marker: 'q2', offset: 0 }],
      });
      const { editor, input, blocks } = await openUnderHeading(verses);
      expect(blocks().slice(3)).toEqual(['p: ', 'q2: [2]Second verse.']);
      fireEvent.keyDown(input, { key: 'L' });
      await waitFor(() => expect(blocks().slice(3)).toEqual(['p: [2]L  ', 'q2: Second verse.']));
      expect(usjToPericopeVerses(editor.getUsj()!)[1].markers?.paragraphs).toEqual([
        { marker: 'p', offset: 0 },
        { marker: 'q2', offset: 2 },
      ]);
    });

    it('lets a line between two verses continue the verse above', async () => {
      const verses = withVerseTwo({ paragraphs: [{ marker: 'p', offset: 0 }] });
      const { input, select, blocks } = await setup(pericopeVersesToUsj(verses, 1, 'GEN'));
      await select('$.content[2].content[1]', 0);
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(blocks().slice(2)).toEqual(['p: ', 'p: [2]Second verse.']));
      await select('$.content[2]', 0);
      expect(fireEvent.keyDown(input, { key: 'x' })).toBe(true);
      expect(blocks()[3]).toBe('p: [2]Second verse.');
    });

    it('does nothing in a read-only editor', async () => {
      const { editor, input, select } = await setup(pericopeVersesToUsj(rows, 1, 'GEN'), true);
      await select('$.content[3].content[1]', 0);
      const applyUpdate = vi.spyOn(editor, 'applyUpdate');
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'N' });
      expect(applyUpdate).not.toHaveBeenCalled();
    });
  });

  describe('a verse number left on its own line', () => {
    const lone: Usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: '1' },
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '1', sid: 'GEN 1:1' }, 'First verse.'],
        },
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '2', sid: 'GEN 1:2' }],
        },
        { type: 'para', marker: 'q1', content: ['Second verse.'] },
      ],
    } as Usj;
    const joined = ['c: 1', 'p: [1]First verse.', 'q1: [2]Second verse.'];

    it('Delete at the end of the number line pulls the text back, keeping its format', async () => {
      const { editor, input, select, blocks } = await setup(lone);
      await select('$.content[2]', 1);
      fireEvent.keyDown(input, { key: 'Delete' });
      await waitFor(() => expect(blocks()).toEqual(joined));
      expect(usjToPericopeVerses(editor.getUsj()!)[1]).toEqual({
        verseNumber: 2,
        text: 'Second verse.',
        markers: { paragraphs: [{ marker: 'q1', offset: 0 }] },
      });
      expect(editor.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[2\]/);
    });

    it('Backspace at the start of the text joins it to the number', async () => {
      const { input, select, blocks } = await setup(lone);
      await select('$.content[3].content[0]', 0);
      fireEvent.keyDown(input, { key: 'Backspace' });
      await waitFor(() => expect(blocks()).toEqual(joined));
    });

    it('leaves a number that is followed by another verse alone', async () => {
      const usj = {
        ...lone,
        content: [
          ...lone.content.slice(0, 3),
          {
            type: 'para',
            marker: 'p',
            content: [{ type: 'verse', marker: 'v', number: '3', sid: 'GEN 1:3' }, 'Third verse.'],
          },
        ],
      } as Usj;
      const { editor, input, select } = await setup(usj);
      await select('$.content[2]', 1);
      const applyUpdate = vi.spyOn(editor, 'applyUpdate');
      // The key reaches Lexical's own delete, which extends the DOM selection; jsdom has no modify().
      const modify = Object.getOwnPropertyDescriptor(Selection.prototype, 'modify');
      Object.defineProperty(Selection.prototype, 'modify', { configurable: true, value: () => {} });
      try {
        fireEvent.keyDown(input, { key: 'Delete' });
      } finally {
        if (modify) Object.defineProperty(Selection.prototype, 'modify', modify);
        else Reflect.deleteProperty(Selection.prototype, 'modify');
      }
      expect(applyUpdate).not.toHaveBeenCalled();
    });
  });

  describe('removing the new paragraph under a heading', () => {
    it('Backspace removes it and returns to the end of the heading', async () => {
      const { editor, input, select, blocks } = await setup(pericopeVersesToUsj(rows, 1, 'GEN'));
      const loaded = blocks();
      await select('$.content[2].content[0]', 5);
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(blocks()[3]).toBe('p: '));
      fireEvent.keyDown(input, { key: 'Backspace' });
      await waitFor(() => expect(blocks()).toEqual(loaded));
      expect(editor.getSelection()?.start).toEqual({
        jsonPath: '$.content[2].content[0]',
        offset: 5,
      });
    });

    it('Delete removes it and keeps the Poetry line below', async () => {
      const verses = withVerseTwo({
        headings: [heading],
        paragraphs: [{ marker: 'q2', offset: 0 }],
      });
      const { input, select, blocks } = await setup(pericopeVersesToUsj(verses, 1, 'GEN'));
      const loaded = blocks();
      await select('$.content[2].content[0]', 5);
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(blocks()[3]).toBe('p: '));
      fireEvent.keyDown(input, { key: 'Delete' });
      await waitFor(() => expect(blocks()).toEqual(loaded));
    });
  });
});
