import { VERSE_WINDOW } from './verse-window.constants';

export interface VerseWindow {
  /**
   * Text shown before the highlighted match (already windowed/snapped; any
   * whitespace run at the snapped left cut is stripped, so no leading whitespace).
   */
  before: string;
  /**
   * The highlighted match text itself — ALWAYS `verseText.slice(matchStart, matchEnd)`.
   * Derived from the verse text, never from any `surf` string (surf is passed only as a
   * length by the caller in Task 2).
   */
  match: string;
  /**
   * Text shown after the highlighted match (already windowed/snapped; any
   * whitespace run at the snapped right cut is stripped, so no trailing whitespace).
   */
  after: string;
  /** True iff a real (non-boundary) cut happened on the LEFT end (caller renders a leading `…`). */
  truncatedStart: boolean;
  /** True iff a real (non-boundary) cut happened on the RIGHT end (caller renders a trailing `…`). */
  truncatedEnd: boolean;
}

/** Simple whitespace test (tabs/NBSP/etc.), per spec — not only U+0020. */
const isWhitespace = (ch: string): boolean => /\s/.test(ch);

/**
 * Clamp a possibly-hostile numeric offset from an upstream service into
 * `[0, max]`. Non-finite / negative → `0`.
 */
const clampOffset = (value: number, max: number): number => {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > max) return max;
  return value;
};

/**
 * A snap candidate: an index within the ± radius of a raw cut, plus its
 * distance from that raw cut. `isBoundary` marks the verse-start/verse-end
 * candidate (position 0 / length) — reaching it is NOT a real cut.
 */
interface SnapCandidate {
  index: number;
  distance: number;
  isBoundary: boolean;
}

/**
 * Pick the nearest candidate to `rawCut` (smallest `|index - rawCut|`),
 * breaking ties first toward the verse-boundary candidate (reaching the
 * boundary is NOT a real cut, so it must beat a whitespace candidate at the
 * same distance — e.g. whitespace at index 0), then toward the outward side.
 * For the START cut the outward side is the smaller index
 * (`preferSmaller = true`); for the END cut it is the larger index
 * (`preferSmaller = false`). Returns `null` when no candidate exists.
 */
const pickNearest = (candidates: SnapCandidate[], preferSmaller: boolean): SnapCandidate | null =>
  candidates.reduce<SnapCandidate | null>((best, c) => {
    if (best === null) return c;
    if (c.distance < best.distance) return c;
    if (c.distance > best.distance) return best;
    // Tie on distance → prefer the boundary candidate over whitespace.
    if (c.isBoundary !== best.isBoundary) return c.isBoundary ? c : best;
    // Then break toward the outward side.
    return preferSmaller ? (c.index < best.index ? c : best) : c.index > best.index ? c : best;
  }, null);

/**
 * Index just past the whitespace run starting at `index` (identity when the
 * character there is not whitespace). Used so `before` never starts with
 * whitespace, even when the window reaches the true verse start.
 */
const skipWhitespaceRun = (text: string, index: number): number => {
  let i = index;
  while (i < text.length && isWhitespace(text[i])) i++;
  return i;
};

/**
 * Build a windowed, highlight-split view of `verseText` around the match at
 * [matchStart, matchStart + matchLength). Pure. See verse-window.constants.ts
 * for the tunables. Never throws; clamps/degrades on out-of-range input.
 */
export function buildVerseWindow(
  verseText: string,
  matchStart: number,
  matchLength: number
): VerseWindow {
  const { contextCharsBefore, contextCharsAfter, maxSpaceSearchDistance } = VERSE_WINDOW;

  // Step 1 — clamp inputs defensively; short-circuit empty verse.
  if (verseText.length === 0) {
    return { before: '', match: '', after: '', truncatedStart: false, truncatedEnd: false };
  }
  const len = verseText.length;
  const safeStart = clampOffset(matchStart, len);
  const safeLength = clampOffset(matchLength, len - safeStart);
  const matchEnd = safeStart + safeLength;

  // Step 2 — match slice always comes from the verse text (surf-agnostic).
  const match = verseText.slice(safeStart, matchEnd);

  // Step 3 — raw window bounds.
  const rawStart = safeStart - contextCharsBefore;
  const rawEnd = matchEnd + contextCharsAfter;

  // Step 4 — snap the START cut.
  let windowStart: number;
  let truncatedStart: boolean;
  if (rawStart <= 0) {
    // Boundary reach — still strip any leading-whitespace run (not a real cut).
    windowStart = skipWhitespaceRun(verseText, 0);
    truncatedStart = false;
  } else {
    const candidates: SnapCandidate[] = [];
    // Whitespace indices within ± radius of rawStart (clamped to the verse).
    const lo = Math.max(0, rawStart - maxSpaceSearchDistance);
    const hi = Math.min(len - 1, rawStart + maxSpaceSearchDistance);
    for (let i = lo; i <= hi; i++) {
      if (isWhitespace(verseText[i])) {
        candidates.push({ index: i, distance: Math.abs(i - rawStart), isBoundary: false });
      }
    }
    // Verse start (0) is a candidate iff it falls within the radius.
    if (rawStart <= maxSpaceSearchDistance) {
      candidates.push({ index: 0, distance: Math.abs(0 - rawStart), isBoundary: true });
    }

    const chosen = pickNearest(candidates, /* preferSmaller (outward) */ true);
    if (chosen === null) {
      // No candidate in radius → hard-cut at the raw offset.
      windowStart = rawStart;
      truncatedStart = true;
    } else if (chosen.isBoundary) {
      // Boundary reach — still strip any leading-whitespace run (not a real cut).
      windowStart = skipWhitespaceRun(verseText, 0);
      truncatedStart = false;
    } else {
      // Whitespace candidate: skip the ENTIRE run starting there so `before`
      // has no leading whitespace.
      windowStart = skipWhitespaceRun(verseText, chosen.index);
      truncatedStart = true;
    }
  }

  // Step 5 — snap the END cut (mirror of step 4).
  let windowEnd: number;
  let truncatedEnd: boolean;
  if (rawEnd >= len) {
    windowEnd = len;
    truncatedEnd = false;
  } else {
    const candidates: SnapCandidate[] = [];
    const lo = Math.max(0, rawEnd - maxSpaceSearchDistance);
    const hi = Math.min(len - 1, rawEnd + maxSpaceSearchDistance);
    for (let i = lo; i <= hi; i++) {
      if (isWhitespace(verseText[i])) {
        candidates.push({ index: i, distance: Math.abs(i - rawEnd), isBoundary: false });
      }
    }
    // Verse end (len) is a candidate iff it falls within the radius.
    if (len - rawEnd <= maxSpaceSearchDistance) {
      candidates.push({ index: len, distance: Math.abs(len - rawEnd), isBoundary: true });
    }

    const chosen = pickNearest(candidates, /* preferSmaller: outward is LARGER */ false);
    if (chosen === null) {
      windowEnd = rawEnd;
      truncatedEnd = true;
    } else if (chosen.isBoundary) {
      windowEnd = len;
      truncatedEnd = false;
    } else {
      // Whitespace candidate: skip the ENTIRE run ending there so `after` has
      // no trailing whitespace. `windowEnd` becomes the index just before the
      // run (exclusive end of the kept text).
      let ws = chosen.index;
      while (ws > 0 && isWhitespace(verseText[ws - 1])) ws--;
      windowEnd = ws;
      truncatedEnd = true;
    }
  }

  // Step 7 — defensive clamp (should never fire given contextChars* > radius):
  // never let a snap cross into the match.
  if (windowStart > safeStart) windowStart = safeStart;
  if (windowEnd < matchEnd) windowEnd = matchEnd;

  // Step 6 — assemble.
  const before = verseText.slice(windowStart, safeStart);
  const after = verseText.slice(matchEnd, windowEnd);

  return { before, match, after, truncatedStart, truncatedEnd };
}
