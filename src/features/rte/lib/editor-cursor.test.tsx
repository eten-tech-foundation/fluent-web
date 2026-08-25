import { createRef, type RefObject } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { pericopeVersesToUsj, type PericopeVerseText } from '@/features/rte/lib/pericope-usj';
import { scopeBlockFormatToVerse } from '@/features/rte/lib/scoped-block-format';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject } from '@eten-tech-foundation/scripture-utilities';
import type { SerializedVerseRef } from '@sillsdev/scripture';

/**
 * The real editor, not the stand-in the wrapper tests use — these pin the two facts about the
 * cursor that `ChapterEditor`'s scoped formatting is built on, so an editor upgrade that changes
 * either of them fails here instead of silently making the format bar dead on the second click.
 *
 * `ScriptureReferencePlugin` is what places the cursor, and it only mounts when `scrRef` is passed
 * alongside `onScrRefChange`.
 */
const rows: PericopeVerseText[] = [
  { verseNumber: 1, text: 'First verse text.', markers: null },
  { verseNumber: 2, text: 'Second verse text.', markers: null },
  { verseNumber: 3, text: 'Third verse text.', markers: null },
];

const at = (verseNum: number): SerializedVerseRef => ({ book: 'GEN', chapterNum: 1, verseNum });

const blockMarkers = (editor: EditorRef | null): string[] =>
  (editor?.getUsj()?.content ?? []).map(node => (node as MarkerObject).marker ?? '');

function Harness({
  editorRef,
  scrRef,
}: {
  editorRef: RefObject<EditorRef | null>;
  scrRef: SerializedVerseRef;
}) {
  return (
    <Editorial
      ref={editorRef}
      defaultUsj={pericopeVersesToUsj(rows, 1, 'GEN')}
      options={{ isReadonly: false, hasExternalUI: true, hasSpellCheck: false }}
      scrRef={scrRef}
      onScrRefChange={vi.fn()}
    />
  );
}

/** An editor holding the chapter with the cursor in verse 2, the way a translator leaves it. */
async function editorWithCursorInVerseTwo() {
  const editorRef = createRef<EditorRef | null>();
  const { rerender } = render(<Harness editorRef={editorRef} scrRef={at(1)} />);
  await waitFor(() => expect(editorRef.current?.getUsj()).toBeTruthy());

  rerender(<Harness editorRef={editorRef} scrRef={at(2)} />);
  await waitFor(() => expect(editorRef.current?.getSelection()).toBeTruthy());

  return { editorRef, rerender };
}

/** The scoped rewrite of verse 2 into poetry, loaded the way `ChapterEditor` loads it. */
const loadScoped = (editor: EditorRef | null): void => {
  const scoped = scopeBlockFormatToVerse(rows, 2, 'q1');
  editor?.setUsj(pericopeVersesToUsj(scoped!.updated, 1, 'GEN'));
};

describe('the cursor across a document reload', () => {
  it('is dropped by the reload, which leaves formatPara nothing to act on', async () => {
    const { editorRef } = await editorWithCursorInVerseTwo();

    loadScoped(editorRef.current);
    await waitFor(() => expect(blockMarkers(editorRef.current)).toEqual(['c', 'p', 'q1', 'p']));

    expect(editorRef.current?.getSelection()).toBeUndefined();

    editorRef.current?.formatPara('p');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(blockMarkers(editorRef.current)).toEqual(['c', 'p', 'q1', 'p']);
  });

  it('comes back when the verse is let go of and asked for again', async () => {
    const { editorRef, rerender } = await editorWithCursorInVerseTwo();

    loadScoped(editorRef.current);
    await waitFor(() => expect(blockMarkers(editorRef.current)).toEqual(['c', 'p', 'q1', 'p']));

    rerender(<Harness editorRef={editorRef} scrRef={at(0)} />);
    rerender(<Harness editorRef={editorRef} scrRef={at(2)} />);
    await waitFor(() => expect(editorRef.current?.getSelection()).toBeTruthy());

    editorRef.current?.formatPara('p');
    await waitFor(() => expect(blockMarkers(editorRef.current)).toEqual(['c', 'p', 'p', 'p']));
  });
});
