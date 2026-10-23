/** Any USFM marker: a backslash and a marker name, such as `\id`, `\c` or `\mt1`. */
const MARKER = /\\[a-zA-Z]+\d*/;

/**
 * A first look at an uploaded file before it goes to the API: text without a single USFM marker
 * (a PDF, a Word document, plain notes) is turned away here, so a stray binary is never sent.
 * Everything else, which book it is and whether it parses, is the API's call (#419), so the
 * upload step and project creation cannot disagree.
 */
export function looksLikeUsfm(text: string): boolean {
  return MARKER.test(text);
}
