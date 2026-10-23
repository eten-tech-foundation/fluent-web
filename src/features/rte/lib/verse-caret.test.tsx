import { Editorial } from '@eten-tech-foundation/platform-editor';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { pericopeVersesToUsj } from './pericope-usj';
import { placeCaretAtVerseEnd } from './verse-caret';

const usj = pericopeVersesToUsj(
  [
    { verseNumber: 1, text: 'First verse.', markers: null },
    { verseNumber: 2, text: '', markers: null },
    { verseNumber: 3, text: 'Third verse.', markers: null },
    {
      verseNumber: 4,
      text: 'Fourth starts here and ends here.',
      markers: {
        paragraphs: [
          { marker: 'p', offset: 0 },
          { marker: 'p', offset: 19 },
        ],
      },
    },
    {
      verseNumber: 5,
      text: 'Fifth verse.',
      markers: { headings: [{ marker: 's1', text: 'Heading' }] },
    },
  ],
  3,
  'JHN'
);

async function renderEditor() {
  const { container } = render(
    <Editorial
      defaultUsj={usj}
      options={{ isReadonly: false, hasExternalUI: true, hasSpellCheck: false }}
    />
  );
  await waitFor(() => expect(container.querySelector('[data-number="5"]')).not.toBeNull());
  const root = container.querySelector<HTMLElement>('.editor-input')!;
  const verse = (n: number) => root.querySelector<HTMLElement>(`[data-number="${n}"]`)!;
  return { root, verse };
}

const caret = () => {
  const selection = window.getSelection()!;
  return { node: selection.anchorNode, offset: selection.anchorOffset };
};

/** The text node holding `words`, and the offset just after them. */
function after(root: HTMLElement, words: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = node.textContent?.indexOf(words) ?? -1;
    if (at >= 0) return { node, offset: at + words.length };
  }
  throw new Error(`no text node holds ${words}`);
}

describe('placeCaretAtVerseEnd', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it("puts the caret after a verse's last word and focuses the editor", async () => {
    const { root } = await renderEditor();

    expect(placeCaretAtVerseEnd(root, 3)).toBe(true);

    expect(caret()).toEqual(after(root, 'Third verse.'));
    expect(document.activeElement).toBe(root);
  });

  it('puts the caret right after the number of an empty verse', async () => {
    const { root, verse } = await renderEditor();

    placeCaretAtVerseEnd(root, 2);

    const paragraph = verse(2).parentElement!;
    expect(caret()).toEqual({
      node: paragraph,
      offset: Array.prototype.indexOf.call(paragraph.childNodes, verse(2)) + 1,
    });
  });

  it('follows a verse into the paragraph it continues in, short of the next heading', async () => {
    const { root } = await renderEditor();

    placeCaretAtVerseEnd(root, 4);

    expect(caret()).toEqual(after(root, 'and ends here.'));
  });

  it('leaves the selection alone for a verse the editor does not hold', async () => {
    const { root } = await renderEditor();
    window.getSelection()!.collapse(root, 0);

    expect(placeCaretAtVerseEnd(root, 9)).toBe(false);

    expect(caret()).toEqual({ node: root, offset: 0 });
  });
});
