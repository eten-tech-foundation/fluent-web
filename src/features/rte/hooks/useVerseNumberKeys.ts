import {
  useCallback,
  useMemo,
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import { PARAGRAPH_MARKER } from '../lib/block-types';
import {
  BLOCK_SELECTOR,
  EDITOR_SELECTOR,
  VERSE_MARKER_SELECTOR,
  elementAt,
  isComposingKey,
} from '../lib/editor-dom';
import { isHeadingMarker } from '../lib/heading-markers';
import {
  afterWordSpace,
  applyAtCaret,
  blockStart,
  breakBeforeVerse,
  caretInBlock,
  claimNextVerse,
  isBodyParagraph,
  loneVerseOf,
  paragraphBreak,
  rejoinVerse,
  verseRightBefore,
} from '../lib/verse-numbers';

import { hasStructuralPayload } from './useProtectedVerseMarkers';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject } from '@eten-tech-foundation/scripture-utilities';

const ZWSP = '\u200B';
const visibleText = (element: Element): string => element.textContent.replace(/[\u200B\s]/g, '');

/** The block element holding the caret. */
function caretBlockElement(root: HTMLElement): Element | undefined {
  const node = window.getSelection()?.anchorNode;
  const block = node ? elementAt(node)?.closest(BLOCK_SELECTOR) : null;
  return block && root.contains(block) ? block : undefined;
}

/**
 * A line with no words and no markers. These DOM checks run on every keystroke, so they come
 * before any call that serializes the document. Without a DOM caret in the editor they can't
 * decide, and the editor's own selection is checked instead.
 */
const mayBeBlank = (block: Element | null | undefined): boolean =>
  !block || (!block.querySelector(VERSE_MARKER_SELECTOR) && visibleText(block) === '');

/** A line holding one verse number and nothing else. */
function mayBeLoneVerse(block: Element | null | undefined): boolean {
  if (!block) return true;
  const verses = block.querySelectorAll(VERSE_MARKER_SELECTOR);
  return verses.length === 1 && visibleText(block) === visibleText(verses[0]);
}

/**
 * Editorial keeps an invisible caret host after a lone verse number. The delta counts it though
 * getUsj leaves it out, so a delete spanning the line has to count it too.
 */
function caretHostLength(block: Element | null | undefined): number {
  if (!block) return 0;
  return Array.from(block.querySelectorAll('[data-lexical-text="true"]'))
    .filter(node => !node.closest(VERSE_MARKER_SELECTOR))
    .map(node => node.textContent)
    .filter(text => text !== '' && [...text].every(char => char === ZWSP))
    .reduce((sum, text) => sum + text.length, 0);
}

/** Only blank text comes before the caret in its block. */
function atTextStart(block: MarkerObject, caretOffset: number): boolean {
  let offset = 0;
  for (const child of block.content ?? []) {
    if (offset >= caretOffset) return true;
    if (typeof child !== 'string' || child.slice(0, caretOffset - offset).trim() !== '')
      return false;
    offset += child.length;
  }
  return true;
}

/**
 * Keyboard and paste handling that keeps a verse number with its text (#397, #530): Enter never
 * splits a number from its words, words typed in a line no verse owns yet bring the next number up,
 * and a number left alone on a line can be joined back from either side. Each edit is one local
 * transaction.
 */
export function useVerseNumberKeys(editorRef: RefObject<EditorRef | null>, readOnly = false) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>): boolean => {
      const root =
        event.target instanceof HTMLElement ? event.target.closest(EDITOR_SELECTOR) : null;
      const editor = editorRef.current;
      if (
        readOnly ||
        !editor ||
        !(root instanceof HTMLElement) ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.nativeEvent.isComposing
      )
        return false;

      const consume = (handled: boolean): boolean => {
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
        }
        return handled;
      };
      const block = caretBlockElement(root);

      // An IME is about to compose: bring the number in first, and let the composition run.
      if (isComposingKey(event.nativeEvent)) {
        if (mayBeBlank(block)) claimNextVerse(editor);
        return false;
      }

      if (event.key === 'Enter') {
        if (event.shiftKey || event.altKey) return false;
        const caret = caretInBlock(editor);
        if (!caret || isHeadingMarker(caret.block.marker)) return false;
        const { usj, index, block: para, offset } = caret;
        const style = para.marker ?? PARAGRAPH_MARKER;
        const verseIndex = verseRightBefore(para, offset);
        if (verseIndex !== undefined)
          return consume(breakBeforeVerse(editor, usj, index, verseIndex, style));
        const at = afterWordSpace(para, offset);
        if (at === undefined) return false;
        return consume(
          applyAtCaret(editor, [{ retain: blockStart(usj, index) + at }, paragraphBreak(style)], {
            jsonPath: `$.content[${index + 1}]`,
            offset: 0,
          })
        );
      }

      // A number alone on its line joins its text again, from either side. (Lexical already removes
      // an empty line on its own, keeping the format of the line below.)
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (event.altKey || event.shiftKey) return false;
        const forward = event.key === 'Delete';
        const lone = forward ? block : block?.previousElementSibling;
        if (block && !(lone && mayBeLoneVerse(lone))) return false;
        const caret = caretInBlock(editor);
        if (!caret) return false;
        const { usj, index, block: para, offset } = caret;
        // The editor root renders one element per top-level USJ block.
        const hostAt = (blockIndex: number) => caretHostLength(root.children[blockIndex]);
        // Anywhere on the line: with the caret in the host after the number, Editorial reports
        // the line's start, and the number itself can't be deleted anyway.
        if (forward)
          return consume(!!loneVerseOf(para) && rejoinVerse(editor, usj, index, hostAt(index)));
        return consume(
          isBodyParagraph(para) &&
            atTextStart(para, offset) &&
            rejoinVerse(editor, usj, index - 1, hostAt(index - 1))
        );
      }

      // A typed character, Alt allowed for the special characters some layouts put there. A space
      // alone does not claim the number: it would leave the number in front of nothing.
      if (event.key.length === 1 && event.key.trim() !== '' && mayBeBlank(block))
        return consume(claimNextVerse(editor, event.key));
      return false;
    },
    [editorRef, readOnly]
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      const root =
        event.target instanceof HTMLElement ? event.target.closest(EDITOR_SELECTOR) : null;
      const editor = editorRef.current;
      if (readOnly || !editor || !(root instanceof HTMLElement)) return;
      // A paste the marker guard will refuse, or one with no words, must not move the number.
      if (hasStructuralPayload(event.clipboardData)) return;
      if (!event.clipboardData.getData('text/plain').trim()) return;
      if (mayBeBlank(caretBlockElement(root))) claimNextVerse(editor);
    },
    [editorRef, readOnly]
  );

  return useMemo(() => ({ handleKeyDown, handlePaste }), [handleKeyDown, handlePaste]);
}
