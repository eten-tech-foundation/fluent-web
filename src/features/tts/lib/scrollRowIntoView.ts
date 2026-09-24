/**
 * Conditional auto-scroll for the playback-active row (§5.3 step 2: "scrolls
 * it into view **when necessary**").
 *
 * Two deliberate properties:
 *
 * 1. **Only when needed.** Yanking the viewport on every clip transition is
 *    hostile to a translator who has deliberately scrolled somewhere else, so
 *    a row that is already fully visible is left exactly where it is.
 * 2. **Never touches focus.** This module only ever calls `scrollTo`/
 *    `scrollIntoView`; it does not call `focus()` on anything. Playback must
 *    not steal the caret from the target editor mid-sentence (§5.2 keeps
 *    "target-text typing and navigation usable").
 *
 * Kept as free functions over elements (no React) so the geometry is unit
 * testable with plain fakes — jsdom reports every rect as 0×0, so the tests
 * inject rects rather than relying on layout.
 */

/** The slice of `Element` this module needs — narrow, so tests can fake it. */
export interface ScrollableRow {
  getBoundingClientRect: () => { top: number; bottom: number };
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
}

/** The slice of a scroll container this module needs. */
export interface ScrollViewport {
  getBoundingClientRect: () => { top: number; bottom: number };
}

/**
 * Is `row` fully inside `viewport` vertically? Horizontal position is
 * irrelevant here: the drafting grid never scrolls sideways, and a partially
 * visible row is still a row the listener cannot follow, so "fully" is the
 * right bar.
 */
export const isRowFullyVisible = (row: ScrollableRow, viewport: ScrollViewport): boolean => {
  const rowRect = row.getBoundingClientRect();
  const viewRect = viewport.getBoundingClientRect();
  return rowRect.top >= viewRect.top && rowRect.bottom <= viewRect.bottom;
};

/**
 * Scroll `row` into view **only if** it is not already fully visible.
 *
 * `block: 'nearest'` is chosen over `'center'` on purpose: when a row is just
 * past the fold, nudging it barely into view preserves the reading context
 * around it, where centering would shuffle the whole page for no reason.
 *
 * Returns whether a scroll was actually performed — the signal the tests
 * assert on, and cheaper than spying on layout.
 */
export const scrollRowIntoViewIfNeeded = (
  row: ScrollableRow | null | undefined,
  viewport: ScrollViewport | null | undefined
): boolean => {
  if (!row) return false;
  // No known viewport ⇒ we cannot prove the row is off-screen, and scrolling
  // unconditionally is the more annoying failure. Do nothing.
  if (!viewport) return false;
  if (isRowFullyVisible(row, viewport)) return false;

  // `scrollIntoView` is absent in some test environments; treat that as
  // "cannot scroll" rather than crashing playback over a cosmetic concern.
  row.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  return true;
};
