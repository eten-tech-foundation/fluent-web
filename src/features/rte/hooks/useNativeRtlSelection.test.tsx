import { createRef, useRef, type RefObject } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useNativeRtlSelection } from './useNativeRtlSelection';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';

const text = 'هذا نص عربي طويل.';
const usj: Usj = {
  type: 'USJ',
  version: '3.1',
  content: [
    { type: 'para', marker: 'q3', content: [{ type: 'verse', marker: 'v', number: '6' }, text] },
    { type: 'para', marker: 'q4', content: [{ type: 'verse', marker: 'v', number: '7' }, text] },
  ],
};

function Harness({ editorRef }: { editorRef: RefObject<EditorRef | null> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useNativeRtlSelection(containerRef);
  return (
    <div ref={containerRef}>
      <Editorial
        ref={editorRef}
        defaultUsj={usj}
        options={{ isReadonly: false, hasExternalUI: true, hasSpellCheck: false }}
      />
    </div>
  );
}

describe('native RTL character selection', () => {
  it.each([
    { direction: 'rtl', key: 'ArrowLeft', native: true },
    { direction: 'ltr', key: 'ArrowRight', native: false },
  ])(
    'keeps the correct block-edge handler for $direction text',
    async ({ direction, key, native }) => {
      const editorRef = createRef<EditorRef | null>();
      const { container } = render(<Harness editorRef={editorRef} />);
      await waitFor(() => expect(editorRef.current?.getUsj()).toBeTruthy());
      const root = container.querySelector<HTMLElement>('.editor-input')!;
      // jsdom cannot resolve dir=auto from Arabic text; supply the browser-resolved direction.
      root.querySelectorAll<HTMLElement>('p').forEach(p => {
        p.style.direction = direction;
      });
      await act(async () => {
        editorRef.current?.setSelection({
          start: { jsonPath: '$.content[0].content[1]', offset: text.length },
        });
      });
      await waitFor(() =>
        expect(editorRef.current?.getSelection()?.start).toEqual({
          jsonPath: '$.content[0].content[1]',
          offset: text.length,
        })
      );
      expect(fireEvent.keyDown(root, { key, shiftKey: true })).toBe(native);
    }
  );
});
