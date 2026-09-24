import { createRef } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { formatHeadingLevel } from './format-heading';
import { pericopeVersesToUsj, usjToPericopeVerses } from './pericope-usj';

import type { EditorRef, SelectionRange } from '@eten-tech-foundation/platform-editor';

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
