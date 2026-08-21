/**
 * The block types the chapter view's format bar can author (#397), and how they map to the USFM
 * paragraph markers stored per verse (fluent-api#264).
 *
 * Deliberately a small subset: every marker here is one a translator can *choose*, so each has to
 * survive the round trip and be in the API's allowlist. Markers that arrive in imported content
 * but are not authorable (`\ms`, `\li`, `\q3`, tables) are preserved by the editor and simply
 * report as "other" in the bar, rather than being silently rewritten to something the translator
 * picked.
 */

export type BlockKind = 'paragraph' | 'heading' | 'poetry' | 'other';

export const PARAGRAPH_MARKER = 'p';
export const DEFAULT_HEADING_MARKER = 's1';
export const DEFAULT_POETRY_MARKER = 'q1';

/** Heading levels the ticket authorises: \s1 through \s4. */
export const HEADING_LEVELS = [1, 2, 3, 4] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Poetry indent levels the bar's indent controls move between. */
export const POETRY_LEVELS = [1, 2] as const;
export type PoetryLevel = (typeof POETRY_LEVELS)[number];

const HEADING_PATTERN = /^s([1-4])?$/;
/**
 * Only the levels the bar can author. `markerFor` clamps poetry to `\q2`, so admitting `\q3` here
 * would let the controls resolve an imported line to a level the translator never picked —
 * outdenting `\q4` would land on `\q2`. Deeper levels read as "other" and are left as they came.
 */
const POETRY_PATTERN = /^q([1-2])?$/;

/** Which of the bar's three kinds a marker belongs to. `undefined` (no cursor) reads as prose. */
export function blockKindOf(marker: string | undefined): BlockKind {
  if (marker === undefined) return 'paragraph';
  if (HEADING_PATTERN.test(marker)) return 'heading';
  if (POETRY_PATTERN.test(marker)) return 'poetry';
  if (marker === PARAGRAPH_MARKER) return 'paragraph';
  return 'other';
}

/**
 * The level carried by a heading or poetry marker. Bare `\s` and `\q` mean level 1 in USFM, so
 * they read as 1 rather than as missing.
 */
export function levelOf(marker: string | undefined): number | undefined {
  if (marker === undefined) return undefined;
  const match = HEADING_PATTERN.exec(marker) ?? POETRY_PATTERN.exec(marker);
  if (!match) return undefined;
  return match[1] ? Number.parseInt(match[1], 10) : 1;
}

/** The marker to apply when the translator picks a kind, keeping the level where it makes sense. */
export function markerFor(kind: BlockKind, level = 1): string {
  switch (kind) {
    case 'heading':
      return `s${Math.min(Math.max(level, 1), 4)}`;
    case 'poetry':
      return `q${Math.min(Math.max(level, 1), 2)}`;
    case 'paragraph':
      return PARAGRAPH_MARKER;
    default:
      return PARAGRAPH_MARKER;
  }
}

/**
 * What the increase-indent control produces. Only poetry indents, and only to `\q2`: deeper levels
 * exist in USFM but the ticket scopes authoring to two.
 */
export function indentedMarker(marker: string | undefined): string | undefined {
  if (blockKindOf(marker) !== 'poetry') return undefined;
  const level = levelOf(marker) ?? 1;
  return level >= 2 ? undefined : markerFor('poetry', level + 1);
}

/**
 * What the decrease-indent control produces. A `\q1` line steps out of poetry entirely and becomes
 * a paragraph, which is the ticket's stated behaviour.
 */
export function outdentedMarker(marker: string | undefined): string | undefined {
  if (blockKindOf(marker) !== 'poetry') return undefined;
  const level = levelOf(marker) ?? 1;
  return level <= 1 ? PARAGRAPH_MARKER : markerFor('poetry', level - 1);
}
