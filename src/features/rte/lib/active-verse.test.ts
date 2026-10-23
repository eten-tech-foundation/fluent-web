import { afterEach, describe, expect, it } from 'vitest';

import { activeVerseRange, outlinePath, verseOutlineShapes } from './active-verse';

function fixture() {
  const editor = document.createElement('div');
  editor.innerHTML =
    '<span data-marker="c" class="chapter">1</span><p data-marker="s1" class="usfm_s1">Title</p><p><span data-marker="v" class="verse" data-number="1">1</span><span>First.</span><span data-marker="v" class="verse" data-number="2">2</span><span>Second.</span></p><p><span>Continued.</span></p><p data-marker="s2" class="usfm_s2">Next title</p><p><span data-marker="v" class="verse" data-number="3">3</span><span>Third.</span></p>';
  document.body.append(editor);
  return editor;
}
function focus(text: Node, offset = 1) {
  const selection = document.getSelection()!;
  selection.setBaseAndExtent(text, offset, text, offset);
  return selection;
}
afterEach(() => {
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
});

describe('active verse range', () => {
  it('distinguishes verses sharing a paragraph and includes continuation paragraphs', () => {
    const editor = fixture();
    const first = editor.querySelector('[data-number="1"]')!.nextSibling!.firstChild!;
    const second = editor.querySelector('[data-number="2"]')!.nextSibling!.firstChild!;
    expect(activeVerseRange(editor, focus(first))?.range.toString()).toBe('1First.');
    const active = activeVerseRange(editor, focus(second))!;
    expect(active.verse).toBe('2');
    expect(active.range.toString()).toBe('2Second.Continued.');
    const continuation = editor.children[3].firstChild!.firstChild!;
    expect(activeVerseRange(editor, focus(continuation))?.verse).toBe('2');
  });
  it.each(['ms1', 'r', 'd', 'sp'])('ends the verse before imported %s headings', marker => {
    const editor = fixture();
    const heading = editor.querySelector('.usfm_s2') as HTMLElement;
    heading.dataset.marker = marker;
    heading.className = 'usfm_' + marker;
    const second = editor.querySelector('[data-number="2"]')!.nextSibling!.firstChild!;
    expect(activeVerseRange(editor, focus(second))?.range.toString()).toBe('2Second.Continued.');
    expect(activeVerseRange(editor, focus(heading.firstChild!))).toBeNull();
  });

  it('does not outline headings or selections outside this editor', () => {
    const editor = fixture();
    expect(
      activeVerseRange(editor, focus(editor.querySelector('.usfm_s1')!.firstChild!))
    ).toBeNull();
    const outside = document.createTextNode('Outside');
    document.body.append(outside);
    expect(activeVerseRange(editor, focus(outside))).toBeNull();
  });
  it('follows the focus end of backwards selections without changing the selection', () => {
    const editor = fixture();
    const first = editor.querySelector('[data-number="1"]')!.nextSibling!.firstChild!;
    const second = editor.querySelector('[data-number="2"]')!.nextSibling!.firstChild!;
    const selection = document.getSelection()!;
    selection.setBaseAndExtent(second, 3, first, 2);
    const selectedText = selection.toString();
    expect(activeVerseRange(editor, selection)?.verse).toBe('1');
    expect(selection.toString()).toBe(selectedText);
  });
});

const line = (left: number, right: number, top: number) => ({
  left,
  top,
  width: right - left,
  height: 20,
});

describe('verse outline shapes', () => {
  it('frames a one-line verse with the gap on every side', () => {
    expect(verseOutlineShapes([line(100, 300, 10)], 3)).toEqual([
      [
        [303, 7],
        [303, 33],
        [97, 33],
        [97, 7],
      ],
    ]);
  });

  it('joins wrapped lines into one shape whose edges meet halfway between the lines', () => {
    // Lines 0-20 and 26-46: the shared edge sits at 23, so neither line's frame crosses the
    // other and nothing is left open between them.
    expect(verseOutlineShapes([line(150, 400, 0), line(50, 250, 26)], 3)).toEqual([
      [
        [403, -3],
        [403, 23],
        [253, 23],
        [253, 49],
        [47, 49],
        [47, 23],
        [147, 23],
        [147, -3],
      ],
    ]);
  });

  it('draws one shape for three or more lines, sorted by position', () => {
    const lines = [line(50, 200, 52), line(150, 400, 0), line(50, 400, 26)];
    expect(verseOutlineShapes(lines, 3)).toEqual([
      [
        [403, -3],
        [403, 49],
        [203, 49],
        [203, 75],
        [47, 75],
        [47, 23],
        [147, 23],
        [147, -3],
      ],
    ]);
  });

  it('keeps lines that share no horizontal space as shapes that only touch', () => {
    const [first, second] = verseOutlineShapes([line(300, 400, 0), line(50, 150, 26)], 3);
    expect(first).toEqual([
      [403, -3],
      [403, 23],
      [297, 23],
      [297, -3],
    ]);
    expect(second).toEqual([
      [153, 23],
      [153, 49],
      [47, 49],
      [47, 23],
    ]);
  });
});

describe('outline path', () => {
  it('draws on the pixel grid with rounded corners', () => {
    const shape = [
      [303, 7],
      [303, 33],
      [97, 33],
      [97, 7],
    ] as const;
    expect(outlinePath(shape, 2)).toBe(
      'M301.5 7.5Q303.5 7.5 303.5 9.5' +
        'L303.5 31.5Q303.5 33.5 301.5 33.5' +
        'L99.5 33.5Q97.5 33.5 97.5 31.5' +
        'L97.5 9.5Q97.5 7.5 99.5 7.5Z'
    );
  });

  it('drops points that land on top of each other or along an edge once snapped', () => {
    const path = outlinePath(
      [
        [10, 10],
        [10.2, 10],
        [15, 10],
        [20, 10],
        [20, 20],
        [10, 20],
      ],
      1
    );
    expect(path.match(/Q/g)).toHaveLength(4);
    expect(path).not.toContain('NaN');
  });

  it('rounds a one-pixel step no further than the step allows', () => {
    const path = outlinePath(
      [
        [0, 0],
        [100, 0],
        [100, 10],
        [101, 10],
        [101, 20],
        [0, 20],
      ],
      2
    );
    expect(path).toContain('L100.5 10Q100.5 10.5 101 10.5');
  });
});
