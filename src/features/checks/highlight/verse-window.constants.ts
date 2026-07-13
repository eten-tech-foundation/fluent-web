/**
 * Tunables for the in-card verse-context window around a repeated-word match
 * (Task 1). Centralized by requirement: there must be exactly ONE place these
 * live — no magic numbers scattered in the util or the card. Not user-facing in
 * v1; a future change is a single edit here.
 */
export const VERSE_WINDOW = Object.freeze({
  /** Characters of context to include BEFORE the match start (raw cut, before snapping). */
  contextCharsBefore: 26,
  /** Characters of context to include AFTER the match end (raw cut, before snapping). */
  contextCharsAfter: 26,
  /**
   * Radius (in characters) to search in BOTH directions (±) around a raw char cut
   * when snapping to the nearest whitespace OR verse boundary (position 0 / length).
   * If no candidate falls within this radius, hard-cut at the raw char offset
   * (handles space-less scripts gracefully). MUST stay strictly smaller than both
   * contextCharsBefore and contextCharsAfter so a snap can never cross into the
   * match (this is what lets buildVerseWindow skip a match-crossing fallback).
   */
  maxSpaceSearchDistance: 10,
} as const);
