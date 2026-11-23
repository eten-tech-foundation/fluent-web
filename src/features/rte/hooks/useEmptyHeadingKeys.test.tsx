import { createRef, type RefObject } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '../lib/pericope-usj';

import { useEmptyHeadingKeys } from './useEmptyHeadingKeys';

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
const selectionModify = Object.getOwnPropertyDescriptor(Selection.prototype, 'modify');
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  // Lexical's Delete of a character extends the selection with Selection.modify, which jsdom
  // lacks. These tests check what reaches the editor, so a no-op stands in.
  Object.defineProperty(Selection.prototype, 'modify', { configurable: true, value: () => {} });
});
afterEach(() => {
  if (rangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRect);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
  if (selectionModify) Object.defineProperty(Selection.prototype, 'modify', selectionModify);
  else Reflect.deleteProperty(Selection.prototype, 'modify');
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

/** Verse 2 under a heading in the middle of the chapter; `title` is the heading's words. */
const midChapterWith = (title: string): PericopeVerseText[] => [
  { verseNumber: 1, text: 'First verse.', markers: null },
  {
    verseNumber: 2,
    text: 'Second verse.',
    markers: {
      headings: [{ marker: 's1', text: title }],
      paragraphs: [{ marker: 'p', offset: 0 }],
    },
  },
];

/** What the save path keeps of `midChapterWith('')`. */
const savedMidChapter: PericopeVerseText[] = [
  { verseNumber: 1, text: 'First verse.', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
  { verseNumber: 2, text: 'Second verse.', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
];

/** The same rows with a subtitle under the title, its words `subtitle`. */
const withSubtitle = (verses: PericopeVerseText[], subtitle: string): PericopeVerseText[] =>
  verses.map(verse =>
    verse.markers?.headings
      ? {
          ...verse,
          markers: {
            ...verse.markers,
            headings: [...verse.markers.headings, { marker: 's2', text: subtitle }],
          },
        }
      : verse
  );

const hasHeading = (usj: Usj): boolean =>
  usj.content.some(node => typeof node === 'object' && node.marker === 's1');

/** The marker of each line, top to bottom. */
const lineMarkers = (usj: Usj): Array<string | undefined> =>
  usj.content.map(node => (typeof node === 'object' ? node.marker : node));

function Harness({
  editorRef,
  usj,
  readOnly = false,
}: {
  editorRef: RefObject<EditorRef | null>;
  usj: Usj;
  readOnly?: boolean;
}) {
  const handleKeyDown = useEmptyHeadingKeys(editorRef, readOnly);
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

// Lexical's own Delete of an empty line runs in jsdom (only a Delete of a character needs
// Selection.modify), so these check the line going and where the caret lands. jsdom has no layout:
// the browser E2E checks that the pane doesn't scroll.
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
    expect(editorRef.current!.getSelection()?.start).toEqual({
      jsonPath: '$.content[1].content[1]',
      offset: 0,
    });
    expect(hasHeading(editorRef.current!.getUsj()!)).toBe(false);
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(savedWithoutHeading);
  });
});

// Lexical's own Delete takes an empty line away by leaving its caret between the blocks, on the
// editor root, which scrolled the pane to the end of the chapter and left the format bar in the
// heading (#625 QA). Here the editor still does the deletion, and the caret then goes where the
// heading was.
describe('Delete in an empty heading', () => {
  it.each([
    ['under the chapter number', rowsWith(''), 1, savedWithoutHeading],
    ['in the middle of the chapter', midChapterWith(''), 2, savedMidChapter],
  ])(
    '%s takes the line away and puts the caret at the start of the verse text below',
    async (_, verses, line, saved) => {
      const { editorRef, input, place } = await setup(verses);
      await place(`$.content[${line}]`);
      const deletes: Array<string | undefined> = [];
      // Captured, so the caret is read before the editor acts on the key.
      input.addEventListener(
        'keydown',
        event => {
          if (event.key === 'Delete')
            deletes.push(editorRef.current!.getSelection()?.start.jsonPath);
        },
        true
      );

      fireEvent.keyDown(input, { key: 'Delete' });

      // One Delete reaches the editor, so nothing past the empty line goes with it.
      expect(deletes).toEqual([`$.content[${line}]`]);
      // Reading the selection first commits the editor's update.
      expect(editorRef.current!.getSelection()?.start).toEqual({
        jsonPath: `$.content[${line}].content[1]`,
        offset: 0,
      });
      expect(hasHeading(editorRef.current!.getUsj()!)).toBe(false);
      expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(saved);
    }
  );

  it.each([
    ['Shift', { shiftKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
  ])('with %s does the same', async (_, modifier) => {
    const { editorRef, input, place } = await setup(midChapterWith(''));
    await place('$.content[2]');

    fireEvent.keyDown(input, { key: 'Delete', ...modifier });

    expect(editorRef.current!.getSelection()?.start).toEqual({
      jsonPath: '$.content[2].content[1]',
      offset: 0,
    });
    expect(hasHeading(editorRef.current!.getUsj()!)).toBe(false);
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(savedMidChapter);
  });
});

// A title and a subtitle over one verse. The line under the empty heading is then a heading too,
// and the caret goes by the same rule: the start of that line's text, or the line itself when it
// has none. It never stays between two blocks, on the editor root.
describe('An empty heading above another heading', () => {
  it.each([
    ['Delete', 'under the chapter number', rowsWith(''), 1, savedWithoutHeading],
    ['Delete', 'in the middle of the chapter', midChapterWith(''), 2, savedMidChapter],
    ['Backspace', 'under the chapter number', rowsWith(''), 1, savedWithoutHeading],
  ])(
    '%s %s, both empty: one line goes and the caret stays in the other, then that one goes too',
    async (key, _, verses, line, saved) => {
      const { editorRef, input, place } = await setup(withSubtitle(verses, ''));
      await place(`$.content[${line}]`);
      const before = lineMarkers(editorRef.current!.getUsj()!);
      expect(before.slice(line, line + 3)).toEqual(['s1', 's2', 'p']);

      fireEvent.keyDown(input, { key });

      // The editor merges the two empty lines and keeps its caret in the one that is left.
      expect(editorRef.current!.getSelection()?.start).toEqual({
        jsonPath: `$.content[${line}]`,
        offset: 0,
      });
      expect(lineMarkers(editorRef.current!.getUsj()!)).toEqual([
        ...before.slice(0, line),
        's1',
        ...before.slice(line + 2),
      ]);

      fireEvent.keyDown(input, { key });

      expect(editorRef.current!.getSelection()?.start).toEqual({
        jsonPath: `$.content[${line}].content[1]`,
        offset: 0,
      });
      expect(lineMarkers(editorRef.current!.getUsj()!)).toEqual([
        ...before.slice(0, line),
        ...before.slice(line + 2),
      ]);
      expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(saved);
    }
  );

  it('Delete above a heading with words puts the caret at the start of those words', async () => {
    const { editorRef, input, place } = await setup(withSubtitle(midChapterWith(''), 'Subtitle'));
    await place('$.content[2]');

    fireEvent.keyDown(input, { key: 'Delete' });

    expect(editorRef.current!.getSelection()?.start).toEqual({
      jsonPath: '$.content[2].content[0]',
      offset: 0,
    });
    expect(lineMarkers(editorRef.current!.getUsj()!)).toEqual(['c', 'p', 's2', 'p']);
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual([
      savedMidChapter[0],
      {
        ...savedMidChapter[1],
        markers: {
          headings: [{ marker: 's2', text: 'Subtitle' }],
          paragraphs: [{ marker: 'p', offset: 0 }],
        },
      },
    ]);
  });
});

describe('Keys left to the editor', () => {
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

  it.each(['Backspace', 'Delete'])(
    '%s in a heading with words, where the guard keeps them out of scripture',
    key => expectUntouched(rowsWith('Title'), '$.content[1].content[0]', { key })
  );

  it('Backspace in an empty heading under a verse, which the editor removes itself', () =>
    expectUntouched(midChapterWith(''), '$.content[2]', { key: 'Backspace' }));

  it.each([
    { key: 'Backspace', isComposing: true },
    { key: 'Backspace', keyCode: 229, isComposing: false },
    { key: 'Delete', isComposing: true },
    { key: 'Delete', keyCode: 229, isComposing: false },
  ])('during a composition: %j', event => expectUntouched(rowsWith(''), '$.content[1]', event));

  it.each(['Backspace', 'Delete'])('%s in a read-only editor', key =>
    expectUntouched(rowsWith(''), '$.content[1]', { key }, true)
  );

  it.each(['Backspace', 'Delete'])('%s from other controls', async key => {
    const { editorRef, getByLabelText, place } = await setup(rowsWith(''));
    await place('$.content[1]');
    const setSelection = vi.spyOn(editorRef.current!, 'setSelection');
    fireEvent.keyDown(getByLabelText('Outside editor'), { key });
    expect(setSelection).not.toHaveBeenCalled();
  });
});
