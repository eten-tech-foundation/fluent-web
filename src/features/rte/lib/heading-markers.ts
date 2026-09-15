import type { VerseMarkers } from '@/lib/types';

/** Matches fluent-api's USFM_HEADING_MARKERS allowlist. These blocks own their words. */
const HEADING_MARKERS = new Set([
  's',
  's1',
  's2',
  's3',
  's4',
  'sr',
  'r',
  'd',
  'sp',
  'sd',
  'sd1',
  'sd2',
  'sd3',
  'sd4',
  'ms',
  'ms1',
  'ms2',
  'ms3',
  'mr',
  'cd',
  'cl',
]);

export const isHeadingMarker = (marker: string | undefined): boolean =>
  marker !== undefined && HEADING_MARKERS.has(marker);

export const isValidHeadingText = (text: string): boolean =>
  text.trim().length > 0 && text.trim().length <= 300 && !/[\\\n\r\u2028\u2029]/.test(text);

export type HeadingError = 'text' | 'count' | null;

/** Validate direct editor changes too, before they enter the autosave queue. */
export function headingErrorIn(rows: Array<{ markers: VerseMarkers | null }>): HeadingError {
  for (const row of rows) {
    const headings = row.markers?.headings ?? [];
    if (headings.length > 4) return 'count';
    if (headings.some(heading => !isValidHeadingText(heading.text))) return 'text';
  }
  return null;
}
