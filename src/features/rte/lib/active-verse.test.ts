import { afterEach, describe, expect, it } from 'vitest';

import { activeVerseRange } from './active-verse';

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
