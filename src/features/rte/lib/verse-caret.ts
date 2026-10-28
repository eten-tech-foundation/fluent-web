import { activeVerseRange } from './active-verse';
import {
  BLOCK_SELECTOR,
  SCRIPTURE_MARKER_SELECTOR,
  VERSE_MARKER_SELECTOR,
  collapseAfter,
  hasWords,
  wordsEnd,
} from './editor-dom';
import { isHeadingMarker } from './heading-markers';

/**
 * Asks the editor holding this verse to take the caret there. Each request is a new object, so
 * asking for the same verse twice moves the caret twice.
 */
export interface VerseCaretRequest {
  verseNumber: number;
}

/** The last text with words between a verse number and the next one. Headings belong to the next. */
function lastWords(
  root: HTMLElement,
  marker: Element,
  next: Element | undefined
): Text | undefined {
  const verse = document.createRange();
  verse.setStartAfter(marker);
  if (next) verse.setEndBefore(next);
  else verse.setEnd(root, root.childNodes.length);

  let last: Text | undefined;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || !verse.intersectsNode(text) || parent.closest(SCRIPTURE_MARKER_SELECTOR))
      continue;
    const block = parent.closest(BLOCK_SELECTOR)?.getAttribute('data-marker') ?? undefined;
    if (isHeadingMarker(block)) continue;
    if (hasWords(text.data)) last = text;
  }
  return last;
}

/**
 * The verse the caret is in, or undefined outside a verse (a heading, say). Right after a verse
 * number it is that number's verse: an empty verse is only its number, so a click leaves the caret
 * between it and the next number, a point `activeVerseRange` gives to the next verse.
 */
export function verseAtCaret(root: HTMLElement, selection: Selection | null): number | undefined {
  const before = selection?.focusNode?.childNodes[selection.focusOffset - 1];
  if (before instanceof Element && before.matches(VERSE_MARKER_SELECTOR) && root.contains(before))
    return Number(before.getAttribute('data-number'));
  const active = activeVerseRange(root, selection);
  return active ? Number(active.verse) : undefined;
}

/**
 * Focuses the editor with the caret at the end of a verse: after its last word, or right after its
 * number when it has none yet. Returns false when the editor doesn't hold the verse.
 *
 * Firefox can't put a caret between two verse numbers from a click, but it keeps one placed
 * there. Lexical picks the position up from `selectionchange`.
 */
export function placeCaretAtVerseEnd(root: HTMLElement, verseNumber: number): boolean {
  const markers = Array.from(root.querySelectorAll(VERSE_MARKER_SELECTOR));
  const index = markers.findIndex(
    marker => marker.getAttribute('data-number') === `${verseNumber}`
  );
  const marker = markers.at(index);
  const selection = window.getSelection();
  if (index < 0 || !marker?.parentElement || !selection) return false;

  const words = lastWords(root, marker, markers.at(index + 1));
  root.focus({ preventScroll: true });
  // Before the space the editor keeps ahead of the next number, so typing continues the words.
  if (words) selection.collapse(words, wordsEnd(words.data));
  else collapseAfter(selection, marker);
  return true;
}
