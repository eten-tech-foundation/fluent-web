import { useEffect, type RefObject } from 'react';

import {
  BLOCK_SELECTOR,
  EDITABLE_EDITOR_SELECTOR,
  VERSE_MARKER_SELECTOR,
  elementAt,
} from '../lib/editor-dom';

/** The editor pads its non-editable markers with these; they are not words. */
const INVISIBLE_CHARACTERS = /[​﻿]/g;

/** A verse is empty when nothing but other markers follows its number in the paragraph. */
function isEmptyVerse(marker: Element): boolean {
  for (let node = marker.nextSibling; node; node = node.nextSibling) {
    if (node instanceof Element && node.matches(VERSE_MARKER_SELECTOR)) return true;
    if ((node.textContent ?? '').replace(INVISIBLE_CHARACTERS, '').trim() !== '') return false;
  }
  return true;
}

/** The last verse number before the point in reading order, so the verse the click follows. */
function markerBefore(block: Element, x: number, y: number): Element | undefined {
  const rtl = getComputedStyle(block).direction === 'rtl';
  let found: Element | undefined;
  for (const marker of Array.from(block.children)) {
    if (!marker.matches(VERSE_MARKER_SELECTOR)) continue;
    const box = marker.getBoundingClientRect();
    const earlierLine = box.bottom <= y;
    const earlierOnLine = box.top <= y && y < box.bottom && (rtl ? box.right >= x : box.left <= x);
    if (earlierLine || earlierOnLine) found = marker;
  }
  return found;
}

/**
 * Lets a click put the caret in a verse that has no words yet (#314).
 *
 * An empty verse is only its number, a non-editable element, so an undrafted pericope is a
 * paragraph of numbers with no text between them. Firefox cannot hold a caret between two
 * non-editable elements: a click there lands at the end of the paragraph, so the words go into the
 * last verse, or before the chapter number, where they are never saved. Clicking a number itself
 * leaves the caret outside the editor in Chromium too. Editorial moves the caret for its own
 * empty-verse placeholder only behind `hasActiveTextFocusBox`, which also draws its focus box.
 *
 * After the browser has handled a plain click on an empty verse's number, or on the paragraph
 * just after one, this puts the caret in the paragraph right after that number. Lexical picks
 * the position up from `selectionchange`, so typing and pasting land in that verse.
 */
export function useEmptyVerseCaret(
  containerRef: RefObject<HTMLElement | null>,
  readOnly: boolean
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;

    const onClick = (event: MouseEvent) => {
      // Double clicks select words and shift-clicks extend a selection; both stay native.
      if (event.button !== 0 || event.detail > 1 || event.shiftKey) return;
      const target = event.target instanceof Node ? elementAt(event.target) : null;
      const root = target?.closest<HTMLElement>(EDITABLE_EDITOR_SELECTOR);
      if (!target || !root || !container.contains(root)) return;
      const selection = window.getSelection();
      if (!selection || (selection.rangeCount > 0 && !selection.isCollapsed)) return;

      const clicked = target.closest(VERSE_MARKER_SELECTOR);
      const block = (clicked ?? target).closest(BLOCK_SELECTOR);
      if (!block || !root.contains(block)) return;
      // Clicks on words are the browser's to place.
      if (!clicked && target !== block) return;
      const marker = clicked ?? markerBefore(block, event.clientX, event.clientY);
      if (marker?.parentElement !== block || !isEmptyVerse(marker)) return;

      root.focus({ preventScroll: true });
      selection.collapse(block, Array.prototype.indexOf.call(block.childNodes, marker) + 1);
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [containerRef, readOnly]);
}
