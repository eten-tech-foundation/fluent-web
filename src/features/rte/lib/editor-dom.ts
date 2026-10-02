/** DOM landmarks shared by editor input, selection and decoration handlers. */
export const EDITOR_SELECTOR = '.editor-input';
export const EDITABLE_EDITOR_SELECTOR = `${EDITOR_SELECTOR}[contenteditable="true"]`;
export const VERSE_MARKER_SELECTOR = '.verse, [data-marker="v"]';
export const SCRIPTURE_MARKER_SELECTOR = `${VERSE_MARKER_SELECTOR}, .chapter, [data-marker="c"]`;
export const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, .para';

export const elementAt = (node: Node): Element | null =>
  node instanceof Element ? node : node.parentElement;

/** Some IMEs confirm a candidate after isComposing has already become false. */
export const isComposingKey = (event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean =>
  event.isComposing || event.keyCode === 229;
