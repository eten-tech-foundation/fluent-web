import { createRef } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatHeadingLevel } from './format-heading';
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
    save: (usj: Parameters<EditorRef['setUsj']>[0]) => {
      onChange(usjToPericopeVerses(usj));
    },
  };
}

describe('heading levels in the real editor', () => {
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

  it.each(['s2', 's3', 's4'])('saves immediate typing after switching to %s', async marker => {
    const { ref, container, onChange, save } = await setup({
      start: { jsonPath: '$.content[2].content[0]', offset: 3 },
    });
    onChange.mockClear();
    // No selection read, delay, or reselection between the format and text input.
    await act(async () => {
      formatHeadingLevel(ref.current!, marker, save);
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
    const { ref, container, onChange, save } = await setup({
      start: { jsonPath: '$.content[2].content[0]', offset: 3 },
    });
    act(() => {
      formatHeadingLevel(ref.current!, 's3', save);
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
    const save = vi.fn();
    act(() => {
      expect(formatHeadingLevel(ref.current!, 's3', save)).toBeUndefined();
    });
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('[data-marker="q2"]')).toHaveTextContent('First verse.');
    expect(container.querySelector('[data-marker="s1"]')).toHaveTextContent('Title');
    expect(container.querySelector('[data-marker="s3"]')).toBeNull();
  });
});
