import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PericopeEditor, type PericopeEditorProps } from './PericopeEditor';

import type { VerseCaretRequest } from '../lib/verse-caret';

// The real editor: the request is answered with a DOM caret the editor has to hold.
const verses = [
  { verseNumber: 9, text: 'Ninth verse.', markers: null },
  { verseNumber: 10, text: '', markers: null },
  { verseNumber: 11, text: '', markers: null },
];

function renderEditor(props: Partial<PericopeEditorProps> = {}) {
  const all: PericopeEditorProps = {
    bookCode: 'JHN',
    chapterNumber: 3,
    contentKey: 'caret',
    verses,
    onVersesChange: vi.fn(),
    ...props,
  };
  const view = render(<PericopeEditor {...all} />);
  return {
    ...view,
    request: (caretRequest: VerseCaretRequest | null, more: Partial<PericopeEditorProps> = {}) =>
      view.rerender(<PericopeEditor {...all} {...more} caretRequest={caretRequest} />),
  };
}

async function editorRoot(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('[data-number="11"]')).not.toBeNull());
  return container.querySelector<HTMLElement>('.editor-input')!;
}

/** Where the caret sits, as the verse number it follows and whether it is right after it. */
function caretAfterNumber(root: HTMLElement) {
  const selection = window.getSelection()!;
  const node = selection.anchorNode;
  if (!node || !root.contains(node)) return undefined;
  const before = node.childNodes[selection.anchorOffset - 1];
  return before instanceof Element ? before.getAttribute('data-number') : undefined;
}

describe('PericopeEditor caret requests (#479)', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('takes the caret in a verse of this pericope when asked', async () => {
    const { container, request } = renderEditor();
    const root = await editorRoot(container);

    request({ verseNumber: 10 });

    expect(document.activeElement).toBe(root);
    expect(caretAfterNumber(root)).toBe('10');
  });

  it('leaves a request for another pericope alone', async () => {
    const { container, request } = renderEditor();
    const root = await editorRoot(container);

    request({ verseNumber: 16 });

    expect(document.activeElement).not.toBe(root);
  });

  it('leaves a request made before the editor mounted alone', async () => {
    // Switching views remounts the editor; the old Next Pericope request was not for it.
    const { container } = renderEditor({ caretRequest: { verseNumber: 10 } });
    const root = await editorRoot(container);

    expect(document.activeElement).not.toBe(root);
  });

  it('does nothing in a read-only editor', async () => {
    const { container, request } = renderEditor({ readOnly: true });
    const root = await editorRoot(container);

    request({ verseNumber: 10 }, { readOnly: true });

    expect(document.activeElement).not.toBe(root);
  });
});

describe('PericopeEditor clicks (#479)', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it('reports the verse the caret is in after a click in its words', async () => {
    const onVerseClick = vi.fn();
    const { container } = renderEditor({ onVerseClick });
    const root = await editorRoot(container);
    const words = [...root.querySelectorAll('span')]
      .flatMap(span => [...span.childNodes])
      .find(node => node.textContent?.includes('Ninth'))!;

    window.getSelection()!.collapse(words, 3);
    fireEvent.click(root);

    expect(onVerseClick).toHaveBeenCalledWith(9);
  });

  it('reports the empty verse whose number the caret follows', async () => {
    const onVerseClick = vi.fn();
    const { container } = renderEditor({ onVerseClick });
    const root = await editorRoot(container);
    const marker = root.querySelector('[data-number="10"]')!;
    const paragraph = marker.parentElement!;

    window
      .getSelection()!
      .collapse(paragraph, Array.prototype.indexOf.call(paragraph.childNodes, marker) + 1);
    fireEvent.click(root);

    expect(onVerseClick).toHaveBeenCalledWith(10);
  });
});
