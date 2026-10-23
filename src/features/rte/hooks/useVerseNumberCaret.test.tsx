import { createRef, useRef, type RefObject } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { pericopeVersesToUsj } from '../lib/pericope-usj';

import { useVerseNumberCaret } from './useVerseNumberCaret';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

// A pericope nobody has drafted yet, except its last verse.
const usj = pericopeVersesToUsj(
  [
    { verseNumber: 1, text: '', markers: null },
    { verseNumber: 2, text: '', markers: null },
    { verseNumber: 3, text: 'Third verse.', markers: null },
  ],
  3,
  'JHN'
);

function Harness({
  editorRef,
  readOnly = false,
}: {
  editorRef: RefObject<EditorRef | null>;
  readOnly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useVerseNumberCaret(containerRef, readOnly);
  return (
    <div ref={containerRef}>
      <Editorial
        ref={editorRef}
        defaultUsj={usj}
        options={{ isReadonly: readOnly, hasExternalUI: true, hasSpellCheck: false }}
      />
    </div>
  );
}

async function renderEditor(readOnly = false) {
  const editorRef = createRef<EditorRef | null>();
  const { container } = render(<Harness editorRef={editorRef} readOnly={readOnly} />);
  await waitFor(() => expect(container.querySelector('[data-marker="v"]')).not.toBeNull());
  const verse = (n: number) =>
    container.querySelector<HTMLElement>(`[data-marker="v"][data-number="${n}"]`)!;
  const paragraph = verse(1).parentElement!;
  return { container, verse, paragraph };
}

/** Lay the verse numbers out on one line, 10px wide with 10px between them (jsdom has no layout). */
function layOut(markers: HTMLElement[]) {
  markers.forEach((marker, index) => {
    const left = index * 20;
    marker.getBoundingClientRect = () =>
      ({ left, right: left + 10, top: 0, bottom: 20, width: 10, height: 20 }) as DOMRect;
  });
}

/**
 * Lay the verse numbers out on lines the way a browser does: each number 19px tall, centred in a
 * 26px line, so a click can land in the band just above or below the numbers.
 */
function layOutLines(paragraph: HTMLElement, lines: HTMLElement[][]) {
  paragraph.style.lineHeight = '26px';
  lines.forEach((markers, line) => {
    markers.forEach((marker, index) => {
      const left = index * 20;
      const top = line * 26 + 3.5;
      marker.getBoundingClientRect = () =>
        ({ left, right: left + 10, top, bottom: top + 19, width: 10, height: 19 }) as DOMRect;
    });
  });
}

const caret = () => {
  const selection = window.getSelection()!;
  return { node: selection.anchorNode, offset: selection.anchorOffset };
};

const slotAfter = (marker: HTMLElement) =>
  Array.prototype.indexOf.call(marker.parentElement!.childNodes, marker) + 1;

describe('clicking into an empty verse', () => {
  it('puts the caret right after the number of the empty verse that was clicked', async () => {
    const { verse, paragraph } = await renderEditor();

    fireEvent.click(verse(2).firstElementChild ?? verse(2));

    expect(caret()).toEqual({ node: paragraph, offset: slotAfter(verse(2)) });
  });

  it('puts the caret after the empty verse a click on the paragraph follows', async () => {
    const { verse, paragraph } = await renderEditor();
    layOut([verse(1), verse(2), verse(3)]);

    // Between the numbers of verses 1 and 2, which Firefox cannot hold a caret in.
    fireEvent.click(paragraph, { clientX: 15, clientY: 10 });

    expect(caret()).toEqual({ node: paragraph, offset: slotAfter(verse(1)) });
  });

  it('puts the caret after the empty verse to the left of a click just below the numbers', async () => {
    const { verse, paragraph } = await renderEditor();
    layOutLines(paragraph, [[verse(1), verse(2), verse(3)]]);

    // Past verse 1's number, in the band between the numbers and the bottom of their line.
    fireEvent.click(paragraph, { clientX: 15, clientY: 24 });

    expect(caret()).toEqual({ node: paragraph, offset: slotAfter(verse(1)) });
  });

  it('puts the caret after the empty verse on the line a click just above the numbers is on', async () => {
    const { verse, paragraph } = await renderEditor();
    layOutLines(paragraph, [[verse(1)], [verse(2), verse(3)]]);

    // Past verse 2's number, in the band at the top of the second line.
    fireEvent.click(paragraph, { clientX: 15, clientY: 27 });

    expect(caret()).toEqual({ node: paragraph, offset: slotAfter(verse(2)) });
  });

  it('follows reading order in a right-to-left paragraph', async () => {
    const { verse, paragraph } = await renderEditor();
    // jsdom cannot resolve dir=auto; supply the direction a browser resolves for Arabic text.
    paragraph.style.direction = 'rtl';
    [verse(1), verse(2), verse(3)].forEach((marker, index) => {
      const right = 100 - index * 20;
      marker.getBoundingClientRect = () =>
        ({ left: right - 10, right, top: 0, bottom: 20, width: 10, height: 20 }) as DOMRect;
    });

    // Left of verse 1's number, which in RTL is just after it.
    fireEvent.click(paragraph, { clientX: 85, clientY: 10 });

    expect(caret()).toEqual({ node: paragraph, offset: slotAfter(verse(1)) });
  });

  it('leaves a click past the number of a verse with words to the browser', async () => {
    const { verse, paragraph } = await renderEditor();
    layOut([verse(1), verse(2), verse(3)]);
    window.getSelection()!.collapse(paragraph, 0);

    // Just past verse 3's number, on its words.
    fireEvent.click(paragraph, { clientX: 55, clientY: 10 });

    expect(caret()).toEqual({ node: paragraph, offset: 0 });
  });

  it('keeps a selection the translator dragged', async () => {
    const { verse, paragraph } = await renderEditor();
    window.getSelection()!.setBaseAndExtent(paragraph, 0, paragraph, slotAfter(verse(2)));

    fireEvent.click(verse(2));

    expect(window.getSelection()!.isCollapsed).toBe(false);
  });

  it('does nothing in a read-only editor', async () => {
    const { verse, paragraph } = await renderEditor(true);
    window.getSelection()!.collapse(paragraph, 0);

    fireEvent.click(verse(2));

    expect(caret()).toEqual({ node: paragraph, offset: 0 });
  });
});

describe('clicking the number of a verse with words (#479)', () => {
  it('puts the caret right after the number that was clicked', async () => {
    const { verse, paragraph } = await renderEditor();
    window.getSelection()!.collapse(paragraph, 0);

    fireEvent.click(verse(3));

    expect(caret()).toEqual({ node: paragraph, offset: slotAfter(verse(3)) });
  });

  it('puts the caret after the number when the click reaches the paragraph through it', async () => {
    // A number followed by words lets the pointer through (editor-shared.css), so the paragraph
    // gets the click. Firefox put the caret at the end of the verse before, Chromium at the start
    // of the paragraph.
    const { verse, paragraph } = await renderEditor();
    layOut([verse(1), verse(2), verse(3)]);
    window.getSelection()!.collapse(paragraph, 0);

    fireEvent.click(paragraph, { clientX: 45, clientY: 10 });

    expect(caret()).toEqual({ node: paragraph, offset: slotAfter(verse(3)) });
  });

  it('counts a click just below the number as a click on it', async () => {
    const { verse, paragraph } = await renderEditor();
    layOutLines(paragraph, [[verse(1), verse(2), verse(3)]]);
    window.getSelection()!.collapse(paragraph, 0);

    // Under verse 3's number, between it and the bottom of its line.
    fireEvent.click(paragraph, { clientX: 45, clientY: 24 });

    expect(caret()).toEqual({ node: paragraph, offset: slotAfter(verse(3)) });
  });
});
