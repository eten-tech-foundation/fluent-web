import { createRef } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatHeadingLevel, removeHeading } from './format-heading';
import { pericopeVersesToUsj, usjToPericopeVerses } from './pericope-usj';

import type { EditorRef, SelectionRange } from '@eten-tech-foundation/platform-editor';

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

const rect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const rects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});
afterEach(() => {
  if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
});

const rows = [
  { verseNumber: 1, text: 'First verse.', markers: { paragraphs: [{ marker: 'q2', offset: 0 }] } },
  {
    verseNumber: 2,
    text: 'Second verse.',
    markers: {
      headings: [{ marker: 's1', text: 'Title' }],
      paragraphs: [{ marker: 'p', offset: 0 }],
    },
  },
];

async function setup(selection: SelectionRange) {
  const ref = createRef<EditorRef>();
  const onChange = vi.fn();
  const { container } = render(
    <Editorial
      ref={ref}
      defaultUsj={pericopeVersesToUsj(rows, 1, 'GEN')}
      options={{ isReadonly: false, hasExternalUI: true, hasSpellCheck: false }}
      onUsjChange={usj => {
        onChange(usjToPericopeVerses(usj));
      }}
    />
  );
  await waitFor(() => expect(ref.current?.getUsj()).toBeTruthy());
  act(() => ref.current!.setSelection(selection));
  await waitFor(() => expect(ref.current!.getSelection()).toBeTruthy());
  return {
    ref,
    container,
    onChange,
  };
}

describe('heading levels in the real editor', () => {
  it.each(['s2', 's3', 's4'])('saves immediate typing after switching to %s', async marker => {
    const { ref, container, onChange } = await setup({
      start: { jsonPath: '$.content[2].content[0]', offset: 3 },
    });
    onChange.mockClear();
    // No selection read, delay, or reselection between the format and text input.
    await act(async () => {
      formatHeadingLevel(ref.current!, marker);
      fireEvent(
        container.querySelector('.editor-input')!,
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertReplacementText',
          data: 'NEW',
        })
      );
    });
    await waitFor(() =>
      expect(container.querySelector(`[data-marker="${marker}"]`)).toHaveTextContent('TitNEWle')
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        rows[0],
        { ...rows[1], markers: { ...rows[1].markers, headings: [{ marker, text: 'TitNEWle' }] } },
      ])
    );
    expect(usjToPericopeVerses(ref.current!.getUsj()!)[0]).toEqual(rows[0]);
  });

  it('changes the heading while preserving scripture and saves its level', async () => {
    const { ref, container, onChange } = await setup({
      start: { jsonPath: '$.content[2].content[0]', offset: 3 },
    });
    act(() => {
      formatHeadingLevel(ref.current!, 's3');
    });
    await waitFor(() =>
      expect(container.querySelector('[data-marker="s3"]')).toHaveTextContent('Title')
    );
    expect(container.querySelector('[data-marker="q2"]')).toHaveTextContent('First verse.');
    expect(container.querySelector('[data-marker="s3"] [data-marker="v"]')).toBeNull();
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        rows[0],
        {
          ...rows[1],
          markers: { ...rows[1].markers, headings: [{ marker: 's3', text: 'Title' }] },
        },
      ])
    );
  });

  it('refuses a selection reaching from a heading into the previous verse', async () => {
    const { ref, container } = await setup({
      start: { jsonPath: '$.content[2].content[0]', offset: 4 },
      end: { jsonPath: '$.content[1].content[1]', offset: 2 },
    });
    act(() => {
      expect(formatHeadingLevel(ref.current!, 's3')).toBeUndefined();
    });
    expect(container.querySelector('[data-marker="q2"]')).toHaveTextContent('First verse.');
    expect(container.querySelector('[data-marker="s1"]')).toHaveTextContent('Title');
    expect(container.querySelector('[data-marker="s3"]')).toBeNull();
  });
});

describe('removing a heading in the real editor', () => {
  const withoutHeading = { ...rows[1], markers: { paragraphs: [{ marker: 'p', offset: 0 }] } };
  const editable = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.editor-input')!;

  it.each([
    ['the caret', { start: { jsonPath: '$.content[2].content[0]', offset: 3 } }],
    [
      'a selection',
      {
        start: { jsonPath: '$.content[2].content[0]', offset: 1 },
        end: { jsonPath: '$.content[2].content[0]', offset: 4 },
      },
    ],
  ] as const)(
    'removes the heading %s is in, words and line, and leaves scripture alone',
    async (_, selection) => {
      const { ref, container, onChange } = await setup(selection);
      act(() => {
        expect(removeHeading(ref.current!, editable(container))).toBe(true);
      });
      await waitFor(() => expect(container.querySelector('[data-marker="s1"]')).toBeNull());
      expect(container.querySelector('[data-marker="q2"]')).toHaveTextContent('First verse.');
      expect(container.querySelector('[data-marker="p"]')).toHaveTextContent('Second verse.');
      await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([rows[0], withoutHeading]));
      expect(ref.current!.getUsj()!.content).toHaveLength(3);
      // No line without a marker is left where the heading was.
      expect(editable(container).children).toHaveLength(3);
    }
  );

  // A delta can't remove an empty paragraph in Editorial 0.8.15; the editor's own Delete can, and
  // jsdom can't run it (no Selection.modify), so this checks the hand-off. The E2E checks the rest.
  it('hands the line of a heading whose words were all deleted to the editor Delete', async () => {
    const { ref, container } = await setup({
      start: { jsonPath: '$.content[2].content[0]', offset: 3 },
    });
    // The heading's 5 letters start after the chapter (1) and verse 1's line (14).
    act(() => ref.current!.applyUpdate([{ retain: 15 }, { delete: 5 }], 'local'));
    act(() => {
      editable(container).focus();
      ref.current!.setSelection({ start: { jsonPath: '$.content[2]', offset: 0 } });
    });
    await waitFor(() => expect(ref.current!.getSelection()?.start.jsonPath).toBe('$.content[2]'));
    const applyUpdate = vi.spyOn(ref.current!, 'applyUpdate');
    const deletes: Array<string | undefined> = [];
    // Captured, so the caret is read before the editor acts on the key.
    editable(container).addEventListener(
      'keydown',
      event => {
        if (event.key === 'Delete') deletes.push(ref.current!.getSelection()?.start.jsonPath);
      },
      true
    );

    act(() => {
      expect(removeHeading(ref.current!, editable(container))).toBe(true);
    });

    expect(deletes).toEqual(['$.content[2]']);
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('leaves the caret at the start of the verse under it, so typing lands there', async () => {
    const { ref, container, onChange } = await setup({
      start: { jsonPath: '$.content[2].content[0]', offset: 3 },
    });
    onChange.mockClear();
    // No selection read or delay between the removal and the text input.
    await act(async () => {
      removeHeading(ref.current!, editable(container));
      fireEvent(
        container.querySelector('.editor-input')!,
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertReplacementText',
          data: 'New ',
        })
      );
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        rows[0],
        { ...withoutHeading, text: 'New Second verse.' },
      ])
    );
  });

  it('removes only that heading when titles are adjacent', async () => {
    const titled = [
      rows[0],
      {
        ...rows[1],
        markers: {
          ...rows[1].markers,
          headings: [
            { marker: 's1', text: 'Title' },
            { marker: 's2', text: 'Subtitle' },
          ],
        },
      },
    ];
    const ref = createRef<EditorRef>();
    const onChange = vi.fn();
    const { container } = render(
      <Editorial
        ref={ref}
        defaultUsj={pericopeVersesToUsj(titled, 1, 'GEN')}
        options={{ isReadonly: false, hasExternalUI: true, hasSpellCheck: false }}
        onUsjChange={usj => onChange(usjToPericopeVerses(usj))}
      />
    );
    await waitFor(() => expect(ref.current?.getUsj()).toBeTruthy());
    act(() =>
      ref.current!.setSelection({ start: { jsonPath: '$.content[2].content[0]', offset: 2 } })
    );
    await waitFor(() => expect(ref.current!.getSelection()).toBeTruthy());
    act(() => {
      expect(removeHeading(ref.current!, editable(container))).toBe(true);
    });
    await waitFor(() => expect(container.querySelector('[data-marker="s1"]')).toBeNull());
    expect(container.querySelector('[data-marker="s2"]')).toHaveTextContent('Subtitle');
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        rows[0],
        {
          ...rows[1],
          markers: { ...rows[1].markers, headings: [{ marker: 's2', text: 'Subtitle' }] },
        },
      ])
    );
  });

  it.each([
    ['the caret is in scripture', { start: { jsonPath: '$.content[3].content[1]', offset: 2 } }],
    [
      'a selection reaches into the previous verse',
      {
        start: { jsonPath: '$.content[2].content[0]', offset: 4 },
        end: { jsonPath: '$.content[1].content[1]', offset: 2 },
      },
    ],
  ] as const)('refuses when %s', async (_, selection) => {
    const { ref, container } = await setup(selection);
    act(() => {
      expect(removeHeading(ref.current!, editable(container))).toBe(false);
    });
    expect(container.querySelector('[data-marker="s1"]')).toHaveTextContent('Title');
    expect(container.querySelector('[data-marker="q2"]')).toHaveTextContent('First verse.');
    expect(container.querySelector('[data-marker="p"]')).toHaveTextContent('Second verse.');
  });
});
