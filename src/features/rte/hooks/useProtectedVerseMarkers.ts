import { useEffect, type RefObject } from 'react';

import {
  BLOCK_SELECTOR,
  EDITABLE_EDITOR_SELECTOR,
  SCRIPTURE_MARKER_SELECTOR,
  elementAt,
} from '../lib/editor-dom';
import { isHeadingMarker } from '../lib/heading-markers';

interface DeletionIntent {
  direction: 'backward' | 'forward';
  unit: 'character' | 'word' | 'line';
}

function markerContainsPoint(node: Node): boolean {
  return Boolean(elementAt(node)?.closest(SCRIPTURE_MARKER_SELECTOR));
}

function comparePoints(a: Range, aEnd: boolean, b: Range, bEnd: boolean): number {
  const first = a.cloneRange();
  const second = b.cloneRange();
  first.collapse(!aEnd);
  second.collapse(!bEnd);
  return first.compareBoundaryPoints(Range.START_TO_START, second);
}

/** Strict overlap leaves a selection ending just before a marker editable. */
function touchesMarker(range: Range, root: HTMLElement): boolean {
  if (markerContainsPoint(range.startContainer) || markerContainsPoint(range.endContainer)) {
    return true;
  }
  if (range.collapsed) return false;
  return Array.from(root.querySelectorAll(SCRIPTURE_MARKER_SELECTOR)).some(marker => {
    const markerRange = document.createRange();
    markerRange.selectNode(marker);
    return (
      comparePoints(range, true, markerRange, false) > 0 &&
      comparePoints(range, false, markerRange, true) < 0
    );
  });
}

/** Find a protected boundary a delete would cross, without changing the user's selection. */
function deletesAdjacentMarker(range: Range, root: HTMLElement, intent: DeletionIntent): boolean {
  const backward = intent.direction === 'backward';
  if (!range.collapsed) return false;
  const block = elementAt(range.startContainer)?.closest(BLOCK_SELECTOR) ?? root;
  // Paragraph merges remain native. Inline landmarks are checked within the caret's own block.
  const removesInlineMarker = Array.from(block.querySelectorAll(SCRIPTURE_MARKER_SELECTOR)).some(
    marker => {
      const markerRange = document.createRange();
      markerRange.selectNode(marker);
      const pointOrder = comparePoints(range, false, markerRange, backward);
      if (backward ? pointOrder < 0 : pointOrder > 0) return false;
      const gap = document.createRange();
      if (backward) {
        gap.setStartAfter(marker);
        gap.setEnd(range.startContainer, range.startOffset);
      } else {
        gap.setStart(range.startContainer, range.startOffset);
        gap.setEndBefore(marker);
      }
      if (gap.cloneContents().querySelector('br')) return false;
      const text = gap.toString().replace(/\u200B/g, '');
      if (intent.unit === 'line') {
        // Cmd+Backspace deletes a visual line, not the whole paragraph. A verse earlier in a
        // wrapped paragraph must not disable the shortcut on later lines.
        const caretBox =
          typeof range.getClientRects === 'function' ? range.getClientRects()[0] : undefined;
        const markerBoxes = marker.getClientRects();
        if (caretBox?.height && markerBoxes.length > 0) {
          return Array.from(markerBoxes).some(
            box => box.top < caretBox.bottom && box.bottom > caretBox.top
          );
        }
        // Without layout information the visual line extent is unknown. Keep this shortcut
        // conservative rather than risk deleting the verse identity; character/word edits
        // still use their text boundary checks below.
        return true;
      }
      return intent.unit === 'word' ? text.trim() === '' : text === '';
    }
  );
  if (removesInlineMarker) return true;
  // A chapter decorator can be a standalone block. Deleting from the neighboring paragraph
  // boundary would remove that block, unlike merging two ordinary paragraphs.
  const neighbor = backward ? block.previousElementSibling : block.nextElementSibling;
  if (!neighbor || !root.contains(neighbor)) return false;
  // Lexical keeps the earlier block's marker when merging. Across this boundary it would either
  // render scripture as a heading or fold heading words into scripture. Deliberate range edits
  // remain available; this guard only handles a collapsed caret at a block edge.
  const crossesHeadingBoundary =
    neighbor.matches(BLOCK_SELECTOR) &&
    isHeadingMarker(block.getAttribute('data-marker') ?? undefined) !==
      isHeadingMarker(neighbor.getAttribute('data-marker') ?? undefined);
  if (!neighbor.matches(SCRIPTURE_MARKER_SELECTOR) && !crossesHeadingBoundary) return false;
  const edge = document.createRange();
  edge.selectNodeContents(block);
  if (backward) edge.setEnd(range.startContainer, range.startOffset);
  else edge.setStart(range.startContainer, range.startOffset);
  return edge.toString().replace(/\u200B/g, '') === '' && !edge.cloneContents().querySelector('br');
}

function hasStructuralPayload(data: DataTransfer | null): boolean {
  if (!data) return false;
  const html = data.getData('text/html');
  if (
    html &&
    new DOMParser().parseFromString(html, 'text/html').querySelector(SCRIPTURE_MARKER_SELECTOR)
  ) {
    return true;
  }
  // Lexical prefers its private clipboard format over HTML when both are supplied.
  const lexical = data.getData('application/x-lexical-editor');
  return /"type"\s*:\s*"(?:immutable-)?(?:verse|chapter)"/.test(lexical);
}

/**
 * Keep verse/chapter landmarks intact while allowing normal paragraph editing. The upstream
 * `protected` mode also blocks paragraph splits and merges, which Fluent deliberately supports.
 * These capture listeners only cancel destructive edits; pointer selection and copying stay native.
 */
export function useProtectedVerseMarkers(containerRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const editorFor = (event: Event): HTMLElement | null => {
      const target = event.target;
      if (!(target instanceof Node)) return null;
      const editor = elementAt(target)?.closest<HTMLElement>(EDITABLE_EDITOR_SELECTOR);
      return editor && container.contains(editor) ? editor : null;
    };

    const selectionRange = (root: HTMLElement): Range | undefined => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return undefined;
      const range = selection.getRangeAt(0);
      return range.intersectsNode(root) ? range : undefined;
    };

    const block = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const root = editorFor(event);
      if (!root) return;
      const deletion = event.key === 'Backspace' || event.key === 'Delete';
      const insertion =
        event.key === 'Enter' || (event.key.length === 1 && !event.ctrlKey && !event.metaKey);
      if (!deletion && !insertion) return;
      const range = selectionRange(root);
      if (
        range &&
        (touchesMarker(range, root) ||
          (deletion &&
            deletesAdjacentMarker(range, root, {
              direction: event.key === 'Backspace' ? 'backward' : 'forward',
              unit: event.metaKey ? 'line' : event.ctrlKey || event.altKey ? 'word' : 'character',
            })))
      ) {
        block(event);
      }
    };

    const onBeforeInput = (event: InputEvent) => {
      if (!/^(insert|delete)/.test(event.inputType)) return;
      const root = editorFor(event);
      if (!root) return;
      // Native target ranges include word/line deletion and IME replacement, which can extend
      // beyond the visible caret. Some engines do not expose them, so keep the selection fallback.
      const targets = typeof event.getTargetRanges === 'function' ? event.getTargetRanges() : [];
      const range = selectionRange(root);
      const removesMarker = targets.some(target => {
        const targetRange = document.createRange();
        targetRange.setStart(target.startContainer, target.startOffset);
        targetRange.setEnd(target.endContainer, target.endOffset);
        return targetRange.intersectsNode(root) && touchesMarker(targetRange, root);
      });
      if (
        removesMarker ||
        hasStructuralPayload(event.dataTransfer) ||
        (range &&
          (touchesMarker(range, root) ||
            // Lexical treats the directionless deleteContent intent as a forward deletion.
            // It can arrive without a keydown or a native target range.
            ((event.inputType === 'deleteContent' ||
              /^delete.*(?:Backward|Forward)$/.test(event.inputType)) &&
              deletesAdjacentMarker(range, root, {
                direction: event.inputType.endsWith('Backward') ? 'backward' : 'forward',
                unit: event.inputType.includes('Line')
                  ? 'line'
                  : event.inputType.includes('Word')
                    ? 'word'
                    : 'character',
              }))))
      ) {
        block(event);
      }
    };

    const onTransfer = (event: ClipboardEvent | DragEvent) => {
      const root = editorFor(event);
      if (!root) return;
      const range = selectionRange(root);
      const data = 'clipboardData' in event ? event.clipboardData : event.dataTransfer;
      if (
        (range && touchesMarker(range, root)) ||
        ((event.type === 'paste' || event.type === 'drop') && hasStructuralPayload(data))
      ) {
        block(event);
      }
    };

    container.addEventListener('keydown', onKeyDown, true);
    container.addEventListener('beforeinput', onBeforeInput, true);
    container.addEventListener('cut', onTransfer, true);
    container.addEventListener('paste', onTransfer, true);
    container.addEventListener('dragstart', onTransfer, true);
    container.addEventListener('drop', onTransfer, true);
    return () => {
      container.removeEventListener('keydown', onKeyDown, true);
      container.removeEventListener('beforeinput', onBeforeInput, true);
      container.removeEventListener('cut', onTransfer, true);
      container.removeEventListener('paste', onTransfer, true);
      container.removeEventListener('dragstart', onTransfer, true);
      container.removeEventListener('drop', onTransfer, true);
    };
  }, [containerRef]);
}
