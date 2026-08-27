import { createRef, useState, type RefObject } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useVerseCursorRestore } from '@/features/rte/hooks/useVerseCursorRestore';
import { pericopeVersesToUsj, type PericopeVerseText } from '@/features/rte/lib/pericope-usj';
import { scopeBlockFormatToVerse } from '@/features/rte/lib/scoped-block-format';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject } from '@eten-tech-foundation/scripture-utilities';
import type { SerializedVerseRef } from '@sillsdev/scripture';

/**
 * The real editor against `ChapterEditor`'s ordering: the reload and the reference round trip both
 * start inside one click handler. `editor-cursor.test.tsx` pins the mechanism and the wrapper
 * tests pin the intent; the bug this catches lives in the gap between them, where the cursor is
 * asked for correctly but too early, so it selects into a document that is about to be replaced.
 */
const rows: PericopeVerseText[] = [
  { verseNumber: 1, text: 'First verse text.', markers: null },
  { verseNumber: 2, text: 'Second verse text.', markers: null },
  { verseNumber: 3, text: 'Third verse text.', markers: null },
];

const blockMarkers = (editor: EditorRef | null): string[] =>
  (editor?.getUsj()?.content ?? []).map(node => (node as MarkerObject).marker ?? '');

/** Just enough of the wrapper to reproduce the ordering: same hook, same click handler. */
function Harness({ editorRef }: { editorRef: RefObject<EditorRef | null> }) {
  const [scrRef, setScrRef] = useState<SerializedVerseRef>({
    book: 'GEN',
    chapterNum: 1,
    verseNum: 1,
  });
  const { restoreAfterLoad } = useVerseCursorRestore(scrRef, setScrRef);

  const format = (): void => {
    const scoped = scopeBlockFormatToVerse(rows, 2, 'q1');
    editorRef.current?.setUsj(pericopeVersesToUsj(scoped!.updated, 1, 'GEN'));
    restoreAfterLoad(2);
  };

  return (
    <>
      <button type='button' onClick={() => setScrRef(current => ({ ...current, verseNum: 2 }))}>
        put the cursor in verse 2
      </button>
      <button type='button' onClick={format}>
        format verse 2
      </button>
      <Editorial
        ref={editorRef}
        defaultUsj={pericopeVersesToUsj(rows, 1, 'GEN')}
        options={{ isReadonly: false, hasExternalUI: true, hasSpellCheck: false }}
        scrRef={scrRef}
        onScrRefChange={vi.fn()}
      />
    </>
  );
}

describe('useVerseCursorRestore', () => {
  it('puts the cursor back after the load, so the next formatPara lands', async () => {
    const editorRef = createRef<EditorRef | null>();
    render(<Harness editorRef={editorRef} />);
    await waitFor(() => expect(editorRef.current?.getUsj()).toBeTruthy());

    await userEvent.click(screen.getByText('put the cursor in verse 2'));
    await waitFor(() => expect(editorRef.current?.getSelection()).toBeTruthy());

    await userEvent.click(screen.getByText('format verse 2'));
    await waitFor(() => expect(blockMarkers(editorRef.current)).toEqual(['c', 'p', 'q1', 'p']));

    await waitFor(() => expect(editorRef.current?.getSelection()).toBeTruthy());

    editorRef.current?.formatPara('p');
    await waitFor(() => expect(blockMarkers(editorRef.current)).toEqual(['c', 'p', 'p', 'p']));
  });
});
