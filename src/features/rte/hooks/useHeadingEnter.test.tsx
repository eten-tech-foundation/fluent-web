import { createRef, type RefObject } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '../lib/pericope-usj';

import { useHeadingEnter } from './useHeadingEnter';

import type { EditorRef, StateChangeSnapshot } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';

const rows: PericopeVerseText[] = [
  { verseNumber: 1, text: 'First verse.', markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
  {
    verseNumber: 2,
    text: 'Second verse.',
    markers: {
      headings: [{ marker: 's1', text: 'Title' }],
      paragraphs: [{ marker: 'p', offset: 0 }],
    },
  },
];

// Match PericopeEditor's API contract: it does not provide scrRef. Heading Enter must work
// without insertMarker, which requires a scripture-reference controller.
function Harness({
  editorRef,
  usj,
  readOnly = false,
  onStateChange,
  onUsjChange,
}: {
  editorRef: RefObject<EditorRef | null>;
  usj: Usj;
  readOnly?: boolean;
  onStateChange: (state: StateChangeSnapshot) => void;
  onUsjChange: (usj: Usj) => void;
}) {
  const handleKeyDown = useHeadingEnter(editorRef, readOnly);
  return (
    <div onKeyDownCapture={handleKeyDown}>
      <input aria-label='Outside editor' />
      <Editorial
        ref={editorRef}
        defaultUsj={usj}
        options={{ isReadonly: readOnly, hasExternalUI: true, hasSpellCheck: false }}
        onStateChange={onStateChange}
        onUsjChange={onUsjChange}
      />
    </div>
  );
}

async function setup(verses = rows, readOnly = false) {
  const editorRef = createRef<EditorRef>();
  const onStateChange = vi.fn();
  const onUsjChange = vi.fn();
  const usj = pericopeVersesToUsj(verses, 1, 'GEN');
  const rendered = render(
    <Harness {...{ editorRef, usj, readOnly, onStateChange, onUsjChange }} />
  );
  await waitFor(() => expect(editorRef.current?.getUsj()).toBeTruthy());
  const selectHeading = async (offset = 5) => {
    act(() =>
      editorRef.current!.setSelection({ start: { jsonPath: '$.content[2].content[0]', offset } })
    );
    await waitFor(() =>
      expect(editorRef.current!.getSelection()?.start.jsonPath).toBe('$.content[2].content[0]')
    );
  };
  await selectHeading();
  const input = rendered.container.querySelector('.editor-input')!;
  return { ...rendered, editorRef, input, onStateChange, onUsjChange, selectHeading };
}

describe('Enter from a heading in the real editor', () => {
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
  it.each([0, 2, 5])(
    'leaves the whole title intact at offset %s and enters its paragraph',
    async offset => {
      const { editorRef, input, container, selectHeading } = await setup();
      await selectHeading(offset);
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() =>
        expect(editorRef.current!.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[3\]/)
      );
      expect(container.querySelectorAll('[data-marker="s1"]')).toHaveLength(1);
      expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(rows);
    }
  );

  it('keeps Shift+Enter from inserting an invalid title line break', async () => {
    const { editorRef, input } = await setup();
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    await waitFor(() =>
      expect(editorRef.current!.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[3\]/)
    );
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(rows);
  });

  it('skips adjacent titles and enters the body after both', async () => {
    const verses = rows.map(row =>
      row.verseNumber === 2
        ? {
            ...row,
            markers: {
              ...row.markers,
              headings: [
                { marker: 's1', text: 'Title' },
                { marker: 's2', text: 'Subtitle' },
              ],
            },
          }
        : row
    );
    const { editorRef, input } = await setup(verses);
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(editorRef.current!.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[4\]/)
    );
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(verses);
  });

  it('creates a paragraph before poetry and preserves its text and format', async () => {
    const verses = rows.map(row =>
      row.verseNumber === 2
        ? {
            ...row,
            markers: { ...row.markers, paragraphs: [{ marker: 'q2', offset: 0 }] },
          }
        : row
    );
    const { editorRef, input, container } = await setup(verses);
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(container.querySelector('[data-marker="q2"]')).toHaveTextContent('Second verse.')
    );
    await waitFor(() => expect(container.querySelectorAll('[data-marker="p"]')).toHaveLength(2));
    const body = container.querySelectorAll('[data-marker="p"]')[1];
    expect(body.querySelector('[data-marker="v"]')).toHaveTextContent('2');
    expect(body).not.toHaveTextContent('Second verse.');
    expect(editorRef.current!.getUsj()!.content[3]).toMatchObject({
      marker: 'p',
      content: [{ type: 'verse', number: '2' }, '  '],
    });
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(verses);
    act(() => editorRef.current!.undo());
    await waitFor(() => expect(container.querySelectorAll('[data-marker="p"]')).toHaveLength(1));
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(verses);
    act(() => editorRef.current!.redo());
    await waitFor(() => expect(container.querySelectorAll('[data-marker="p"]')).toHaveLength(2));
  });

  it('saves text entered before poetry in the following verse and reloads both blocks', async () => {
    const verses = rows.map(row =>
      row.verseNumber === 2
        ? {
            ...row,
            markers: { ...row.markers, paragraphs: [{ marker: 'q2', offset: 0 }] },
          }
        : row
    );
    const { editorRef, input, container, onUsjChange } = await setup(verses);
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(container.querySelectorAll('[data-marker="p"]')).toHaveLength(2));
    // Exercise the editor's native local edit and the real save callback. This fixture's offset
    // is after c (1), verse 1 + text + LF (14), heading + LF (6), and verse 2 (1).
    act(() =>
      editorRef.current!.applyUpdate([{ retain: 22 }, { insert: 'New paragraph.' }], 'local')
    );
    await waitFor(() =>
      expect(container.querySelectorAll('[data-marker="p"]')[1]).toHaveTextContent('New paragraph.')
    );
    const saved = usjToPericopeVerses(editorRef.current!.getUsj()!);
    expect(saved).toEqual([
      rows[0],
      {
        ...rows[1],
        text: 'New paragraph. Second verse.',
        markers: {
          headings: rows[1].markers!.headings,
          paragraphs: [
            { marker: 'p', offset: 0 },
            { marker: 'q2', offset: 15 },
          ],
        },
      },
    ]);
    expect(usjToPericopeVerses(onUsjChange.mock.lastCall![0])).toEqual(saved);
    act(() => editorRef.current!.setUsj(pericopeVersesToUsj(saved, 1, 'GEN')));
    await waitFor(() =>
      expect(container.querySelector('[data-marker="q2"]')).toHaveTextContent('Second verse.')
    );
    expect(container.querySelector('[data-marker="s1"]')).toHaveTextContent('Title');
    expect(container.querySelectorAll('[data-marker="p"]')[1]).toHaveTextContent('New paragraph.');
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(saved);
  });

  it('enters an empty verse without changing the document', async () => {
    const verses = rows.map(row => (row.verseNumber === 2 ? { ...row, text: '' } : row));
    const { editorRef, input } = await setup(verses);
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(editorRef.current!.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[3\]/)
    );
    expect(usjToPericopeVerses(editorRef.current!.getUsj()!)).toEqual(verses);
  });

  it.each([
    { key: 'Enter', isComposing: true },
    { key: 'Enter', ctrlKey: true },
    { key: 'Enter', metaKey: true },
    { key: 'Enter', altKey: true },
    { key: 'a' },
  ])('does not consume composition or unrelated keys: %j', async event => {
    const { editorRef, input } = await setup();
    const setSelection = vi.spyOn(editorRef.current!, 'setSelection');
    fireEvent.keyDown(input, event);
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('does not create unsaveable text after an orphan heading', async () => {
    const { editorRef, input, selectHeading } = await setup();
    const orphan = {
      ...editorRef.current!.getUsj()!,
      content: editorRef.current!.getUsj()!.content.slice(0, 3),
    };
    act(() => editorRef.current!.setUsj(orphan));
    await waitFor(() => expect(editorRef.current!.getSelection()).toBeUndefined());
    await selectHeading();
    const result = fireEvent.keyDown(input, { key: 'Enter' });
    expect(result).toBe(false);
    expect(editorRef.current!.getUsj()).toEqual(orphan);
  });

  it.each(['p', 'q1', 'q2'])('leaves Enter in a %s body block to the editor', async marker => {
    const verses = rows.map(row =>
      row.verseNumber === 1 ? { ...row, markers: { paragraphs: [{ marker, offset: 0 }] } } : row
    );
    const { editorRef, input } = await setup(verses);
    act(() =>
      editorRef.current!.setSelection({
        start: { jsonPath: '$.content[1].content[1]', offset: 3 },
      })
    );
    await waitFor(() =>
      expect(editorRef.current!.getSelection()?.start.jsonPath).toBe('$.content[1].content[1]')
    );
    const setSelection = vi.spyOn(editorRef.current!, 'setSelection');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('does not handle keys from other controls', async () => {
    const { editorRef, getByLabelText } = await setup();
    const setSelection = vi.spyOn(editorRef.current!, 'setSelection');
    fireEvent.keyDown(getByLabelText('Outside editor'), { key: 'Enter' });
    expect(setSelection).not.toHaveBeenCalled();
  });

  it('does not handle a read-only editor', async () => {
    const { editorRef, input } = await setup(rows, true);
    const setSelection = vi.spyOn(editorRef.current!, 'setSelection');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(setSelection).not.toHaveBeenCalled();
  });
});
