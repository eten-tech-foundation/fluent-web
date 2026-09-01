import { isValidBookCode } from '@eten-tech-foundation/scripture-utilities';

/**
 * What a single uploaded file turned out to be. `not-usfm` means nothing in the file looked
 * like a marker at all; `missing-book` means it parsed but no marker gave us a book code we
 * recognise (#418).
 */
export type UsfmValidationResult =
  | { ok: true; bookCode: string }
  | { ok: false; reason: 'not-usfm' | 'missing-book' };

/** A marker plus whatever text sits on the rest of its line. */
const MARKER_LINE = /\\([a-zA-Z]+\d*)[ \t]*([^\\\r\n]*)/g;

/**
 * The markers a book code may come from, in the order #418 gives them. `\mt` is written
 * either `\mt` or `\mt1`, so both spellings are accepted.
 */
const CODE_MARKERS: Array<(name: string) => boolean> = [
  name => name === 'id',
  name => name === 'toc3',
  name => name === 'mt' || name === 'mt1',
];

/**
 * Client-side pre-flight for an uploaded USFM file. This is not the authority on whether an
 * import succeeds — #419 re-parses server-side — it exists so the translator hears about a bad
 * file at upload time rather than after filling in the form.
 *
 * Unrecognised markers are deliberately not an error: #418 requires tags Fluent cannot render
 * to survive as passthrough data, so this only ever looks for what it needs and ignores the rest.
 */
export function validateUsfmFile(text: string): UsfmValidationResult {
  const markers = [...text.matchAll(MARKER_LINE)].map(match => ({
    name: match[1].toLowerCase(),
    rest: match[2].trim(),
  }));

  if (markers.length === 0) return { ok: false, reason: 'not-usfm' };

  for (const matches of CODE_MARKERS) {
    const marker = markers.find(candidate => matches(candidate.name));
    if (!marker) continue;
    const code = marker.rest.split(/\s+/)[0]?.toUpperCase() ?? '';
    if (code && isValidBookCode(code)) return { ok: true, bookCode: code };
  }

  return { ok: false, reason: 'missing-book' };
}
