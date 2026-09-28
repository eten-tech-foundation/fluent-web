import { createRef } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { insertParagraph } from './insert-paragraph';
import { pericopeVersesToUsj, usjToPericopeVerses } from './pericope-usj';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

type OffsetLocation = Extract<
  NonNullable<ReturnType<EditorRef['getSelection']>>['start'],
  { offset: number }
>;

async function setup(marker = 'p', text = 'First words. Last words.') {
  const ref = createRef<EditorRef>();
  const rows = [
    {
      verseNumber: 1,
      text,
      markers: {
        paragraphs: [{ marker, offset: 0 }],
        headings: [{ marker: 's1', text: 'Whole title' }],
      },
    },
  ];
  const onUsjChange = vi.fn();
  const view = render(
    <Editorial
      ref={ref}
      defaultUsj={pericopeVersesToUsj(rows, 1, 'GEN')}
      options={{ hasExternalUI: true, hasSpellCheck: false }}
      scrRef={{ book: 'GEN', chapterNum: 1, verseNum: 1 }}
      onUsjChange={onUsjChange}
    />
  );
  await waitFor(() => expect(ref.current?.getUsj()).toBeTruthy());
  const select = async (jsonPath: OffsetLocation['jsonPath'], offset: number) => {
    act(() => ref.current!.setSelection({ start: { jsonPath, offset } }));
    await waitFor(() => expect(ref.current!.getSelection()?.start.jsonPath).toBe(jsonPath));
  };
  return { ...view, editor: ref.current!, rows, select, onUsjChange };
}

describe('explicit paragraph insertion in Editorial', () => {
  beforeEach(() => {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  });

  it.each(['p', 'q2'])('splits %s, repeats, and preserves native undo/redo', async marker => {
    const { editor, select, container, onUsjChange } = await setup(marker);
    await select('$.content[2].content[1]', 13);
    act(() => expect(insertParagraph(editor)).toBe(true));
    await waitFor(() => expect(container.querySelectorAll('p')).toHaveLength(3));
    expect(usjToPericopeVerses(editor.getUsj()!)[0].text).toBe('First words. Last words.');
    expect(usjToPericopeVerses(onUsjChange.mock.lastCall![0])[0].markers?.paragraphs).toEqual([
      { marker, offset: 0 },
      { marker: 'p', offset: 13 },
    ]);
    expect(editor.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[3\]/);
    act(() => expect(insertParagraph(editor)).toBe(true));
    await waitFor(() => expect(container.querySelectorAll('p')).toHaveLength(4));
    act(() => editor.undo());
    await waitFor(() => expect(container.querySelectorAll('p')).toHaveLength(3));
    act(() => editor.redo());
    await waitFor(() => expect(container.querySelectorAll('p')).toHaveLength(4));
    expect(container.querySelectorAll('.verse')).toHaveLength(1);
  });

  it.each([0, 5, 11])('keeps a heading whole when inserting from offset %s', async offset => {
    const { editor, select, container } = await setup();
    await select('$.content[1].content[0]', offset);
    act(() => expect(insertParagraph(editor)).toBe(true));
    await waitFor(() => expect(container.querySelectorAll('p')).toHaveLength(3));
    expect(usjToPericopeVerses(editor.getUsj()!)[0]).toMatchObject({
      text: 'First words. Last words.',
      markers: { headings: [{ marker: 's1', text: 'Whole title' }] },
    });
    expect(editor.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[2\]/);
  });

  it('keeps Poetry after the paragraph inserted from a heading', async () => {
    const { editor, select, container } = await setup('q2');
    await select('$.content[1].content[0]', 5);
    act(() => expect(insertParagraph(editor)).toBe(true));
    await waitFor(() => expect(container.querySelectorAll('p')).toHaveLength(3));
    expect(container.querySelector('[data-marker="q2"]')).toHaveTextContent(
      'First words. Last words.'
    );
    expect(editor.getUsj()!.content[2]).toMatchObject({ marker: 'p' });
  });

  it('inserts in an empty verse without losing its number', async () => {
    const { editor, select, container } = await setup('p', '');
    await select('$.content[2]', 1);
    act(() => expect(insertParagraph(editor)).toBe(true));
    await waitFor(() => expect(container.querySelectorAll('p')).toHaveLength(3));
    expect(container.querySelectorAll('.verse')).toHaveLength(1);
    expect(usjToPericopeVerses(editor.getUsj()!)[0].verseNumber).toBe(1);
  });

  it.each(['p', 'q2'])('inserts after the last word in %s', async marker => {
    const { editor, select, container } = await setup(marker);
    await select('$.content[2].content[1]', 24);
    act(() => expect(insertParagraph(editor)).toBe(true));
    await waitFor(() => expect(container.querySelectorAll('p')).toHaveLength(3));
    expect(editor.getUsj()!.content[2]).toMatchObject({ marker });
    expect(editor.getUsj()!.content[3]).toMatchObject({ marker: 'p' });
    expect(editor.getSelection()?.start.jsonPath).toMatch(/^\$\.content\[3\]/);
  });

  it('never replaces a selected range', async () => {
    const { editor } = await setup();
    act(() =>
      editor.setSelection({
        start: { jsonPath: '$.content[2].content[1]', offset: 0 },
        end: { jsonPath: '$.content[2].content[1]', offset: 5 },
      })
    );
    const before = editor.getUsj();
    act(() => expect(insertParagraph(editor)).toBe(false));
    expect(editor.getUsj()).toEqual(before);
  });
});
