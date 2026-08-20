/**
 * How much VERTICAL room the TTS controls are allowed to take — one place, so
 * tuning it is one edit rather than four.
 *
 * The problem these constants solve: the drafting grid's verse rhythm is set
 * by the row's own `py-4`, which puts 32px between one source box and the
 * next. A 40x40 touch-sized button strip added below each box more than
 * doubles that (32px -> 80px), and the page stops reading as a list of verses.
 * Worse, at 80px the strip floats midway between two boxes and stops obviously
 * belonging to either one.
 *
 * Two ideas fix both at once:
 *
 * 1. The strip's VISUAL size and its HIT AREA are separated. The button paints
 *    at 24x24 — which is all the icon needs — while a transparent, absolutely
 *    positioned `::before` restores the 40x40 target the proposal asks for
 *    (T2: "hit areas meet the project's touch sizing conventions even when the
 *    visual icon remains compact"). Being absolute, the pseudo-element costs
 *    no layout height at all.
 * 2. The strip then OVERLAPS the row padding it sits in via a negative bottom
 *    margin. That padding is empty space the row already reserved, so the
 *    strip is nearly free: the added height is `TUCK_TOP + 24 + TUCK_BOTTOM`
 *    = 18px, not 48px.
 *
 * The asymmetry is the point. 4px of air above the strip and ~22px below it
 * means the controls read as attached to the box ABOVE them — the reading
 * order the grid already uses (source text, then its controls) — instead of
 * hanging ambiguously between two verses.
 *
 * The negative margin never reaches past its own row: at -10px the button's
 * bottom edge still stops 6px inside the row's 16px bottom padding, so the
 * strip cannot collide with the next verse or escape the playback wash.
 */

/**
 * A single control button: compact paint, full-size target.
 *
 * `-inset-2` grows the transparent hit box by 8px on every side — 24 + 16 =
 * 40 — and `relative` is what it is measured against. The buttons' own
 * `[&_svg]:size-4` keeps the icon at 16px, so shrinking the box tightens the
 * padding around the glyph rather than the glyph itself.
 */
export const TTS_CONTROL_BUTTON_CLASS =
  'relative h-6 w-6 before:absolute before:-inset-2 before:content-[""]';

/**
 * The strip that holds them. `gap-3` (12px) keeps a 36px pitch, so two 40px
 * hit areas overlap by only 4px and every button keeps a clearly exclusive
 * target.
 */
export const TTS_CONTROL_STRIP_CLASS = 'flex items-center gap-3';

/**
 * What the HOST wraps the strip in. `mt-1` is the tuck; `-mb-2.5` is the
 * overlap into the row padding below. Grid columns that space their children
 * with `space-y-*` need this to win, which it does — a later utility in the
 * same class list overrides the parent's spacing on this child.
 */
export const TTS_CONTROL_ROW_CLASS = 'mt-1 -mb-2.5 flex items-center';
