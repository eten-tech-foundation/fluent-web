import { useEffect, type RefObject } from 'react';

import {
  EDITABLE_EDITOR_SELECTOR,
  SCRIPTURE_MARKER_SELECTOR,
  isComposingKey,
} from '../lib/editor-dom';

/** Keep native bidi selection instead of mixing it with Lexical's block-edge arrow movement. */
export function useNativeRtlSelection(
  containerRef: RefObject<HTMLElement | null>,
  readOnly = false
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || readOnly) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isComposingKey(event) ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      )
        return;
      const root =
        event.target instanceof Element ? event.target.closest(EDITABLE_EDITOR_SELECTOR) : null;
      const selection = window.getSelection();
      const focus = selection?.focusNode;
      const anchor = selection?.anchorNode;
      if (
        !root ||
        !container.contains(root) ||
        !focus ||
        !anchor ||
        focus.nodeType !== Node.TEXT_NODE ||
        !root.contains(focus) ||
        !root.contains(anchor)
      )
        return;
      if (focus.parentElement?.closest(SCRIPTURE_MARKER_SELECTOR)) return;
      const paragraph = focus.parentElement?.closest('p, .para');
      if (!paragraph || getComputedStyle(paragraph).direction !== 'rtl') return;

      // Firefox's native arrow direction and Lexical's bidi block-edge override can both move
      // toward the next paragraph. Let the browser extend the range and let Lexical's normal
      // selectionchange listener synchronize it. Do not cancel the browser's default action.
      event.stopImmediatePropagation();
    };
    container.addEventListener('keydown', onKeyDown, true);
    return () => container.removeEventListener('keydown', onKeyDown, true);
  }, [containerRef, readOnly]);
}
