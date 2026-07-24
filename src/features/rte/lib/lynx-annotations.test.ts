import { DiagnosticSeverity } from '@sillsdev/lynx';
import { describe, expect, it } from 'vitest';

import { diagnosticsToAnnotations, dropCharsetFloods } from './lynx-annotations';
import { slicePericope } from './pericope-slice';
import { usfmToUsj } from './usfm-to-usj';

import type { Diagnostic } from '@sillsdev/lynx';

const USFM =
  '\\id GEN\n\\h Genesis\n\\mt Genesis\n' +
  '\\c 1\n\\p\n\\v 1 Clean verse.\n\\v 2 A "bad quote here.\n\\v 3 Also clean.\n';

function diag(line: number, startChar: number, endChar: number): Diagnostic {
  return {
    code: 'x',
    source: 'quotation-mark-checker',
    severity: DiagnosticSeverity.Warning,
    message: 'test issue',
    range: { start: { line, character: startChar }, end: { line, character: endChar } },
  };
}

describe('diagnosticsToAnnotations', () => {
  it('maps an in-slice diagnostic to a jsonPath + offset inside the slice', () => {
    const chapter = usfmToUsj(USFM);
    const slice = slicePericope(chapter, 1, [2]);
    // The quote character in verse 2: line 6 (`\v 2 A "bad quote here.`), after prefix `\v 2 `.
    const quoteCol = '\\v 2 A '.length;
    const annotations = diagnosticsToAnnotations([diag(6, quoteCol, quoteCol + 1)], USFM, slice);

    expect(annotations).toHaveLength(1);
    const { selection } = annotations[0];
    expect(selection.start.jsonPath).toBe(selection.end.jsonPath);
    expect(selection.end.offset).toBe(selection.start.offset + 1);
    // The offset addresses "A \"bad quote here." — the quote is at index 2.
    expect(selection.start.offset).toBe(2);
  });

  it('spans the verse text for marker-anchored diagnostics, stopping short of the piece end', () => {
    const chapter = usfmToUsj(USFM);
    const slice = slicePericope(chapter, 1, [3]);
    // Lynx verse-order diagnostics anchor on the marker itself: chars 0-4 of the line.
    const annotations = diagnosticsToAnnotations([diag(7, 0, 4)], USFM, slice);

    expect(annotations).toHaveLength(1);
    expect(annotations[0].selection.start.offset).toBe(0);
    // One short of the end: a mark ending exactly at a text piece's end makes
    // platform-editor 0.8.14 append a space to the document text.
    expect(annotations[0].selection.end.offset).toBe('Also clean.'.length - 1);
  });

  it('shifts an end-of-text character diagnostic one char left of the piece end', () => {
    const chapter = usfmToUsj(USFM);
    const slice = slicePericope(chapter, 1, [1]);
    const text = 'Clean verse.';
    const lastCol = '\\v 1 '.length + text.length;
    const annotations = diagnosticsToAnnotations([diag(5, lastCol - 1, lastCol)], USFM, slice);

    expect(annotations).toHaveLength(1);
    expect(annotations[0].selection.start.offset).toBe(text.length - 2);
    expect(annotations[0].selection.end.offset).toBe(text.length - 1);
  });

  it('gives zero-width in-text diagnostics a visible one-character span', () => {
    const chapter = usfmToUsj(USFM);
    const slice = slicePericope(chapter, 1, [2]);
    const caretCol = '\\v 2 A '.length;
    const annotations = diagnosticsToAnnotations([diag(6, caretCol, caretCol)], USFM, slice);

    expect(annotations).toHaveLength(1);
    expect(annotations[0].selection.start.offset).toBe(2);
    expect(annotations[0].selection.end.offset).toBe(3);
  });

  it('drops per-verse allowed-character floods but keeps sparse charset warnings', () => {
    const charset = (line: number, col: number): Diagnostic => ({
      ...diag(line, col, col + 1),
      source: 'allowed-character-set-checker',
    });
    // 12 charset warnings on the line-5 verse (flood: wrong charset for the
    // language, not per-character signal), one on line 7, one quotation issue.
    const flood = Array.from({ length: 12 }, (_, i) => charset(5, 5 + i));
    const kept = [charset(7, 6), diag(6, 8, 9)];

    const result = dropCharsetFloods([...flood, ...kept], 10);

    expect(result).toEqual(kept);
  });

  it('drops diagnostics on verses outside the slice and on header lines', () => {
    const chapter = usfmToUsj(USFM);
    const slice = slicePericope(chapter, 1, [2]);

    const outOfSlice = diag(5, 6, 7); // verse 1 line
    const headerLine = diag(1, 0, 2); // \h line
    expect(diagnosticsToAnnotations([outOfSlice, headerLine], USFM, slice)).toEqual([]);
  });
});
