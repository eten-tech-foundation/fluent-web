/** DOM landmarks shared by editor input, selection and decoration handlers. */
export const EDITOR_SELECTOR = '.editor-input';
export const EDITABLE_EDITOR_SELECTOR = `${EDITOR_SELECTOR}[contenteditable="true"]`;
export const VERSE_MARKER_SELECTOR = '.verse, [data-marker="v"]';
export const SCRIPTURE_MARKER_SELECTOR = `${VERSE_MARKER_SELECTOR}, .chapter, [data-marker="c"]`;
export const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, .para';

export const elementAt = (node: Node): Element | null =>
  node instanceof Element ? node : node.parentElement;

/** The editor pads its non-editable markers with zero-width characters; they are not words. */
const MARKER_PADDING = /[\u200B\uFEFF]/g;

/** Whether a text has words, not just spaces and the editor's marker padding. */
export const hasWords = (text: string): boolean => text.replace(MARKER_PADDING, '').trim() !== '';

/** A text without its spaces or the editor's marker padding, to compare what two blocks show. */
export const visibleText = (text: string): string =>
  text.replace(MARKER_PADDING, '').replace(/\s/g, '');

/** Where a text's words end, before any trailing spaces and marker padding. */
export const wordsEnd = (text: string): number => text.replace(/[\s\u200B\uFEFF]+$/, '').length;

/** Collapses the selection to the slot right after a marker in its paragraph. */
export function collapseAfter(selection: Selection, marker: Element): void {
  const block = marker.parentElement;
  if (block) selection.collapse(block, Array.prototype.indexOf.call(block.childNodes, marker) + 1);
}

/** Some IMEs confirm a candidate after isComposing has already become false. */
export const isComposingKey = (event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean =>
  event.isComposing || event.keyCode === 229;
