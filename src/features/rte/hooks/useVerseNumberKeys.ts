import {
  useCallback,
  useMemo,
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import { PARAGRAPH_MARKER } from '../lib/block-types';
import { hasStructuralPayload } from '../lib/editor-clipboard';
import {
  BLOCK_SELECTOR,
  EDITOR_SELECTOR,
  VERSE_MARKER_SELECTOR,
  elementAt,
  hasWords,
  isComposingKey,
  visibleText,
} from '../lib/editor-dom';
import { isHeadingMarker } from '../lib/heading-markers';
import {
  afterWordSpace,
  applyAtCaret,
  atTextStart,
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

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

/**
 * A key that types one visible character. Code points are counted, since a letter outside the BMP
 * (Adlam, say) takes two UTF-16 units; key names like 'Tab' or 'F2' are longer. A space alone
 * doesn't count: claiming the number for it would leave the number in front of nothing.
 */
const typesCharacter = (key: string): boolean => Array.from(key).length === 1 && key.trim() !== '';

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
  !block || (!block.querySelector(VERSE_MARKER_SELECTOR) && !hasWords(block.textContent));

/** A line holding one verse number and nothing else. */
function mayBeLoneVerse(block: Element | null | undefined): boolean {
  if (!block) return true;
  const verses = block.querySelectorAll(VERSE_MARKER_SELECTOR);
  return (
    verses.length === 1 && visibleText(block.textContent) === visibleText(verses[0].textContent)
  );
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
    .filter(text => /^\u200B+$/.test(text))
    .reduce((sum, text) => sum + text.length, 0);
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
      // Windows reports AltGr as Ctrl+Alt, and Chrome keeps both flags set beside AltGraph. A
      // character typed with it is typing, not a Ctrl shortcut.
      const typedWithAltGraph = event.getModifierState('AltGraph') && typesCharacter(event.key);
      if (
        readOnly ||
        !editor ||
        !(root instanceof HTMLElement) ||
        event.defaultPrevented ||
        (event.ctrlKey && !typedWithAltGraph) ||
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
        const caret = caretInBlock(editor);
        if (!caret || isHeadingMarker(caret.block.marker)) return false;
        const { usj, index, block: para, caretOffset } = caret;
        const style = para.marker ?? PARAGRAPH_MARKER;
        // Any break right after a number goes in front of it. Shift+Enter's line break has no
        // stored form, so here it is a paragraph break too.
        const verseIndex = verseRightBefore(para, caretOffset);
        if (verseIndex !== undefined)
          return consume(breakBeforeVerse(editor, usj, index, verseIndex, style));
        // Elsewhere Shift+Enter stays the editor's line break. Alt+Enter splits like Enter.
        if (event.shiftKey) return false;
        const at = afterWordSpace(para, caretOffset);
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
        const { usj, index, block: para, caretOffset } = caret;
        // The editor root renders one element per top-level USJ block.
        const hostAt = (blockIndex: number) => caretHostLength(root.children[blockIndex]);
        // Anywhere on the line: with the caret in the host after the number, Editorial reports
        // the line's start, and the number itself can't be deleted anyway.
        if (forward)
          return consume(!!loneVerseOf(para) && rejoinVerse(editor, usj, index, hostAt(index)));
        return consume(
          isBodyParagraph(para) &&
            atTextStart(para, caretOffset) &&
            rejoinVerse(editor, usj, index - 1, hostAt(index - 1))
        );
      }

      // A typed character, Alt and AltGr allowed for the special characters some layouts put there.
      if (typesCharacter(event.key) && mayBeBlank(block))
        return consume(claimNextVerse(editor, event.key));
      return false;
    },
    [editorRef, readOnly]
  );

  /**
   * Brings the number in for a paste into a line no verse owns yet. Returns true when it took the
   * paste over: one line of plain text goes in with the number, so one undo takes both back.
   * Anything else (several lines, the editor's own copied content) is left to the editor, landing
   * on the selected caret host.
   */
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLElement>): boolean => {
      const root =
        event.target instanceof HTMLElement ? event.target.closest(EDITOR_SELECTOR) : null;
      const editor = editorRef.current;
      if (readOnly || !editor || !(root instanceof HTMLElement)) return false;
      // A paste the marker guard will refuse, or one with no words, must not move the number.
      const data = event.clipboardData;
      if (hasStructuralPayload(data)) return false;
      const text = data.getData('text/plain');
      if (!text.trim() || !mayBeBlank(caretBlockElement(root))) return false;
      if (/[\r\n]/.test(text) || data.types.includes('application/x-lexical-editor')) {
        claimNextVerse(editor);
        return false;
      }
      // Tabs become spaces, as the editor's own paste makes them.
      const handled = claimNextVerse(editor, text.replace(/\t/g, ' '));
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
      return handled;
    },
    [editorRef, readOnly]
  );

  return useMemo(() => ({ handleKeyDown, handlePaste }), [handleKeyDown, handlePaste]);
}
