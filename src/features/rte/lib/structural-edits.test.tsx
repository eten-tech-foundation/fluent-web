import { createRef } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pericopeVersesToUsj, usjToPericopeVerses, type PericopeVerseText } from './pericope-usj';
import {
  formatVerseBlock,
  insertSectionHeading,
  paragraphBeforePoetryLine,
} from './structural-edits';

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

  it('starts a paragraph at a verse inside one, keeping the verses after it in it', async () => {
    const usj = pericopeVersesToUsj(
      [
        { verseNumber: 1, text: 'First.', markers: null },
        { verseNumber: 2, text: 'Second.', markers: null },
        { verseNumber: 3, text: 'Third.', markers: null },
      ],
      1,
      'GEN'
    );
    const ref = await setup(usj);
    const before = usjToPericopeVerses(ref.current!.getUsj()!);
    act(() => {
      formatVerseBlock(ref.current!, 2, 'p');
    });
    const formatted = [
      before[0],
      { ...before[1], markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
      before[2],
    ];
    await waitFor(() => expect(usjToPericopeVerses(ref.current!.getUsj()!)).toEqual(formatted));
    act(() => ref.current!.undo());
    await waitFor(() => expect(usjToPericopeVerses(ref.current!.getUsj()!)).toEqual(before));
  });
});

// #530: Paragraph on a Poetry line starts a paragraph at the verse and keeps the line Poetry, the
// way USFM writes `\p` then `\q1 \v 3`.
describe('a paragraph that starts with a Poetry line', () => {
  const P = { paragraphs: [{ marker: 'p', offset: 0 }] };
  const Q1 = { paragraphs: [{ marker: 'q1', offset: 0 }] };
  const P_THEN_Q1 = {
    paragraphs: [
      { marker: 'p', offset: 0 },
      { marker: 'q1', offset: 0 },
    ],
  };
  const markersOf = (ref: { current: EditorRef | null }) =>
    ref
      .current!.getUsj()!
      .content.slice(1)
      .map(node => (typeof node === 'string' ? '' : node.marker));

  async function poetry(rows: PericopeVerseText[]) {
    const ref = await setup(pericopeVersesToUsj(rows, 1, 'GEN'));
    return { ref, saved: () => usjToPericopeVerses(ref.current!.getUsj()!) };
  }

  it('puts an empty p before a verse that starts its Poetry line, in one undo step', async () => {
    const { ref, saved } = await poetry([
      { verseNumber: 1, text: 'First.', markers: P },
      { verseNumber: 2, text: 'Second.', markers: Q1 },
      { verseNumber: 3, text: 'Third.', markers: null },
    ]);
    const before = saved();
    act(() => {
      expect(paragraphBeforePoetryLine(ref.current!, 2)).toBe(true);
    });
    await waitFor(() => expect(markersOf(ref)).toEqual(['p', 'p', 'q1']));
    expect(saved()).toEqual([before[0], { ...before[1], markers: P_THEN_Q1 }, before[2]]);
    act(() => ref.current!.undo());
    await waitFor(() => expect(saved()).toEqual(before));
  });

  it('gives a verse in the middle of a Poetry line a line of its own first', async () => {
    const { ref, saved } = await poetry([
      { verseNumber: 1, text: 'First.', markers: P },
      { verseNumber: 2, text: 'Second.', markers: Q1 },
      { verseNumber: 3, text: 'Third.', markers: null },
    ]);
    act(() => {
      expect(paragraphBeforePoetryLine(ref.current!, 3)).toBe(true);
    });
    await waitFor(() => expect(markersOf(ref)).toEqual(['p', 'q1', 'p', 'q1']));
    expect(saved().map(row => row.markers)).toEqual([P, Q1, P_THEN_Q1]);
  });

  it('changes nothing when the paragraph is already there', async () => {
    const { ref } = await poetry([
      { verseNumber: 1, text: 'First.', markers: P },
      { verseNumber: 2, text: 'Second.', markers: P_THEN_Q1 },
    ]);
    const applyUpdate = vi.spyOn(ref.current!, 'applyUpdate');
    expect(paragraphBeforePoetryLine(ref.current!, 2)).toBe(true);
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it('leaves a verse whose line is not Poetry to the usual Paragraph', async () => {
    const { ref } = await poetry([
      { verseNumber: 1, text: 'First.', markers: P },
      { verseNumber: 2, text: 'Second.', markers: null },
    ]);
    const applyUpdate = vi.spyOn(ref.current!, 'applyUpdate');
    expect(paragraphBeforePoetryLine(ref.current!, 2)).toBe(false);
    expect(applyUpdate).not.toHaveBeenCalled();
  });
});
