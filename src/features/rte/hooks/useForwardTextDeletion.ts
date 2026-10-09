import { useEffect, type RefObject } from 'react';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

/** Keep the browser's forward character boundary when Lexical would delete only its last mark. */
export function useForwardTextDeletion(
  containerRef: RefObject<HTMLElement | null>,
  editorRef: RefObject<EditorRef | null>,
  readOnly: boolean
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;
    let composing = false;

    const extendForwardCharacter = (event: KeyboardEvent | InputEvent) => {
      if (event.defaultPrevented || composing || event.isComposing) return;
      if (event instanceof KeyboardEvent) {
        if (
          event.key !== 'Delete' ||
          // 229 is the IME process key. Some browsers send it without setting isComposing.
          event.keyCode === 229 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey
        )
          return;
      } else if (event.inputType !== 'deleteContentForward' && event.inputType !== 'deleteContent')
        return;

      const target = event.target;
      const root =
        target instanceof Element ? target.closest('.editor-input[contenteditable="true"]') : null;
      const dom = window.getSelection();
      const editor = editorRef.current;
      if (!root || !container.contains(root) || !dom?.rangeCount || !dom.isCollapsed || !editor)
        return;
      const original = dom.getRangeAt(0).cloneRange();
      if (
        original.startContainer.nodeType !== Node.TEXT_NODE ||
        !root.contains(original.startContainer) ||
        original.startContainer.parentElement?.closest('[data-marker="v"], [data-marker="c"]')
      )
        return;

      const selection = editor.getSelection();
      const start = selection?.start;
      const end = selection?.end;
      if (
        !start ||
        !('offset' in start) ||
        start.offset !== original.startOffset ||
        (end &&
          (!('offset' in end) || end.jsonPath !== start.jsonPath || end.offset !== start.offset))
      )
        return;

      let endOffset = original.startOffset;
      const targets =
        event instanceof InputEvent && typeof event.getTargetRanges === 'function'
          ? event.getTargetRanges()
          : [];
      const targetRange = targets.length > 0 ? targets[0] : undefined;
      if (
        targetRange?.startContainer === original.startContainer &&
        targetRange.endContainer === original.startContainer &&
        targetRange.startOffset === original.startOffset
      ) {
        endOffset = targetRange.endOffset;
      } else if (typeof dom.modify === 'function') {
        // Use this browser's caret navigation rather than imposing a different Unicode version.
        // Restrict the adjustment to one text leaf so it cannot cross a verse or block boundary.
        // A cluster split across leaves (bold base letter, pasted formatting) needs no help:
        // Lexical only shrinks the range when both ends sit in the same text node.
        dom.modify('extend', 'forward', 'character');
        if (dom.anchorNode === original.startContainer && dom.focusNode === original.startContainer)
          endOffset = dom.focusOffset;
        dom.removeAllRanges();
        dom.addRange(original);
      }
      if (endOffset - original.startOffset <= 1) return;

      // Editorial 0.8.15 (Lexical 0.43) shrinks a collapsed forward deletion of a combining
      // sequence to one code unit. Its selected-text deletion keeps the complete range and the
      // native history.
      editor.setSelection({
        start,
        end: { ...start, offset: endOffset },
      });
      // Complete the selection-only transaction before the input reaches Lexical. Otherwise its
      // selection tag can suppress the text-change callback and lose the autosave notification.
      // This relies on Editorial 0.8.15's getSelection() flushing the pending update; recheck it
      // when upgrading.
      editor.getSelection();
    };
    const startComposition = () => {
      composing = true;
    };
    const endComposition = () => {
      composing = false;
    };
    container.addEventListener('keydown', extendForwardCharacter, true);
    container.addEventListener('beforeinput', extendForwardCharacter, true);
    container.addEventListener('compositionstart', startComposition, true);
    container.addEventListener('compositionend', endComposition, true);
    return () => {
      container.removeEventListener('keydown', extendForwardCharacter, true);
      container.removeEventListener('beforeinput', extendForwardCharacter, true);
      container.removeEventListener('compositionstart', startComposition, true);
      container.removeEventListener('compositionend', endComposition, true);
    };
  }, [containerRef, editorRef, readOnly]);
}
