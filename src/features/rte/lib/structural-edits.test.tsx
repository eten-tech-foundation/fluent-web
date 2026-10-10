import { createRef } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pericopeVersesToUsj, usjToPericopeVerses } from './pericope-usj';
import { formatVerseBlock, insertSectionHeading } from './structural-edits';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';

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

async function setup(usj: Usj) {
  const ref = createRef<EditorRef>();
  const { container } = render(
    <Editorial ref={ref} defaultUsj={usj} options={{ isReadonly: false, hasExternalUI: true }} />
  );
  await waitFor(() => expect(container.querySelector('[data-number="2"]')).toBeTruthy());
  return ref;
}

describe('structural delta boundaries', () => {
  it.each(['Poetry', 'heading'])(
    'keeps text before the first verse marker when adding %s',
    async action => {
      const usj: Usj = {
        type: 'USJ',
        version: '3.1',
        content: [
          { type: 'chapter', marker: 'c', number: '1' },
          {
            type: 'para',
            marker: 'p',
            content: [
              'Prefix ',
              { type: 'verse', marker: 'v', number: '1' },
              'First.',
              { type: 'verse', marker: 'v', number: '2' },
              'Second.',
            ],
          },
        ],
      };
      const ref = await setup(usj);
      const before = usjToPericopeVerses(ref.current!.getUsj()!);
      expect(before[0].text).toBe('Prefix First.');
      act(() => {
        if (action === 'Poetry') formatVerseBlock(ref.current!, 1, 'q1');
        else insertSectionHeading(ref.current!, 1, 's1', 'A title');
      });
      await waitFor(() =>
        expect(usjToPericopeVerses(ref.current!.getUsj()!)[0].text).toBe('Prefix First.')
      );
      const formatted = usjToPericopeVerses(ref.current!.getUsj()!);
      act(() => ref.current!.undo());
      await waitFor(() => expect(usjToPericopeVerses(ref.current!.getUsj()!)).toEqual(before));
      act(() => ref.current!.redo());
      await waitFor(() => expect(usjToPericopeVerses(ref.current!.getUsj()!)).toEqual(formatted));
    }
  );

  it('keeps continuation formatting and reopens the follower in its own block through undo/redo', async () => {
    const usj = pericopeVersesToUsj(
      [
        { verseNumber: 1, text: 'First.', markers: null },
        {
          verseNumber: 2,
          text: 'Front Back.',
          markers: { paragraphs: [{ marker: 'q2', offset: 6 }] },
        },
        { verseNumber: 3, text: 'Third.', markers: null },
      ],
      1,
      'GEN'
    );
    const ref = await setup(usj);
    const before = usjToPericopeVerses(ref.current!.getUsj()!);
    act(() => formatVerseBlock(ref.current!, 2, 'q1'));
    const formatted = [
      before[0],
      {
        ...before[1],
        markers: {
          paragraphs: [
            { marker: 'q1', offset: 0 },
            { marker: 'q2', offset: 6 },
          ],
        },
      },
      { ...before[2], markers: { paragraphs: [{ marker: 'q2', offset: 0 }] } },
    ];
    await waitFor(() => expect(usjToPericopeVerses(ref.current!.getUsj()!)).toEqual(formatted));
    act(() => ref.current!.undo());
    await waitFor(() => expect(usjToPericopeVerses(ref.current!.getUsj()!)).toEqual(before));
    act(() => ref.current!.redo());
    await waitFor(() => expect(usjToPericopeVerses(ref.current!.getUsj()!)).toEqual(formatted));
  });
});
