import { act, fireEvent, render, waitFor } from '@testing-library/react';
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

describe('PericopeEditor caret moves (#624)', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  /** Put the DOM caret somewhere and say so, as the browser does after every caret move. */
  function moveCaret(node: Node, offset: number) {
    window.getSelection()!.collapse(node, offset);
    document.dispatchEvent(new Event('selectionchange'));
  }

  function wordsOf(root: HTMLElement, needle: string) {
    const words = [...root.querySelectorAll('span')]
      .flatMap(span => [...span.childNodes])
      .find(node => node.textContent?.includes(needle));
    // A miss would clear the selection, and a test that expects silence would pass on nothing.
    if (!words) throw new Error(`no editor text contains "${needle}"`);
    return words;
  }

  it('reports each verse the caret moves into', async () => {
    const onActiveVerseChange = vi.fn();
    const { container } = renderEditor({ onActiveVerseChange });
    const root = await editorRoot(container);

    moveCaret(wordsOf(root, 'Ninth'), 3);
    expect(onActiveVerseChange).toHaveBeenLastCalledWith(9);

    const marker = root.querySelector('[data-number="11"]')!;
    const paragraph = marker.parentElement!;
    moveCaret(paragraph, Array.prototype.indexOf.call(paragraph.childNodes, marker) + 1);
    expect(onActiveVerseChange).toHaveBeenLastCalledWith(11);
  });

  /** Select from one point to another, as a drag or Shift+arrow does, and say so. */
  function select(anchor: Node, anchorOffset: number, focus: Node, focusOffset: number) {
    window.getSelection()!.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
    document.dispatchEvent(new Event('selectionchange'));
  }

  function afterNumber(root: HTMLElement, verseNumber: number) {
    const marker = root.querySelector(`[data-number="${verseNumber}"]`)!;
    const paragraph = marker.parentElement!;
    return [paragraph, Array.prototype.indexOf.call(paragraph.childNodes, marker) + 1] as const;
  }

  it('reports the verse a selection starts in, as Chapter View does', async () => {
    const onActiveVerseChange = vi.fn();
    const { container } = renderEditor({ onActiveVerseChange });
    const root = await editorRoot(container);

    // A drag down from verse 9 into verse 11 leaves verse 9 the active one.
    select(wordsOf(root, 'Ninth'), 3, ...afterNumber(root, 11));
    expect(onActiveVerseChange).toHaveBeenLastCalledWith(9);
    expect(onActiveVerseChange).not.toHaveBeenCalledWith(11);

    // And a drag up from verse 11 leaves verse 11.
    select(...afterNumber(root, 11), wordsOf(root, 'Ninth'), 3);
    expect(onActiveVerseChange).toHaveBeenLastCalledWith(11);
  });

  it('keeps one selection listener and calls the newest callback', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const selectionListeners = (spy: typeof added) =>
      spy.mock.calls.filter(([type]) => type === 'selectionchange').length;
    try {
      const { container, request } = renderEditor({ onActiveVerseChange: first });
      const root = await editorRoot(container);
      const [addedBefore, removedBefore] = [selectionListeners(added), selectionListeners(removed)];

      // A new callback comes with every edit that changes the verses.
      request(null, { onActiveVerseChange: second });
      first.mockClear();

      expect(selectionListeners(added)).toBe(addedBefore);
      expect(selectionListeners(removed)).toBe(removedBefore);
      moveCaret(wordsOf(root, 'Ninth'), 3);
      expect(second).toHaveBeenLastCalledWith(9);
      expect(first).not.toHaveBeenCalled();
    } finally {
      added.mockRestore();
      removed.mockRestore();
    }
  });

  it('says nothing while the caret is in a heading, which belongs to no verse', async () => {
    const onActiveVerseChange = vi.fn();
    const { container } = renderEditor({
      onActiveVerseChange,
      verses: [
        verses[0],
        { ...verses[1], markers: { headings: [{ marker: 's1', text: 'Heading words' }] } },
        verses[2],
      ],
    });
    const root = await editorRoot(container);

    moveCaret(wordsOf(root, 'Heading words'), 3);

    expect(onActiveVerseChange).not.toHaveBeenCalled();
  });

  it('says nothing about a caret in another part of the page', async () => {
    const onActiveVerseChange = vi.fn();
    const { container } = renderEditor({ onActiveVerseChange });
    await editorRoot(container);
    const elsewhere = document.createElement('p');
    elsewhere.textContent = 'Source words';
    document.body.append(elsewhere);

    try {
      moveCaret(elsewhere.firstChild!, 3);

      expect(onActiveVerseChange).not.toHaveBeenCalled();
    } finally {
      elsewhere.remove();
    }
  });
});

describe('PericopeEditor keyboard focus (#624)', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    (document.activeElement as HTMLElement | null)?.blur();
  });

  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  function wordsOf(root: HTMLElement, needle: string) {
    const words = [...root.querySelectorAll('span')]
      .flatMap(span => [...span.childNodes])
      .find(node => node.textContent?.includes(needle));
    if (!words) throw new Error(`no editor text contains "${needle}"`);
    return words;
  }

  it('reports the verse the caret lands in when Tab brings focus in', async () => {
    const onKeyboardFocus = vi.fn();
    const { container } = renderEditor({ onKeyboardFocus });
    const root = await editorRoot(container);

    act(() => root.focus());
    // The browser puts the caret in once focus has landed.
    window.getSelection()!.collapse(wordsOf(root, 'Ninth'), 3);

    await waitFor(() => expect(onKeyboardFocus).toHaveBeenCalledWith(9));
  });

  it('reports Tab focus that comes right after a click somewhere else', async () => {
    // A fast keyboard user can Tab in moments after clicking; only a press still held is a click.
    const onKeyboardFocus = vi.fn();
    const { container } = renderEditor({ onKeyboardFocus });
    const root = await editorRoot(container);

    fireEvent.pointerDown(root);
    fireEvent.pointerUp(window);
    act(() => root.focus());
    window.getSelection()!.collapse(wordsOf(root, 'Ninth'), 3);

    await waitFor(() => expect(onKeyboardFocus).toHaveBeenCalledWith(9));
  });

  it('leaves the focus that comes with a press to the click', async () => {
    const onKeyboardFocus = vi.fn();
    const { container } = renderEditor({ onKeyboardFocus });
    const root = await editorRoot(container);

    fireEvent.pointerDown(root);
    act(() => root.focus());
    await nextFrame();

    expect(onKeyboardFocus).not.toHaveBeenCalled();
  });

  it('leaves the focus of a Next Pericope caret request alone', async () => {
    const onKeyboardFocus = vi.fn();
    const { container, request } = renderEditor({ onKeyboardFocus });
    const root = await editorRoot(container);

    request({ verseNumber: 10 });
    await nextFrame();

    expect(document.activeElement).toBe(root);
    expect(onKeyboardFocus).not.toHaveBeenCalled();
  });
});
