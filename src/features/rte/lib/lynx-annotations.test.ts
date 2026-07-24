import { DiagnosticSeverity } from '@sillsdev/lynx';
import { describe, expect, it } from 'vitest';

import { diagnosticsToAnnotations } from './lynx-annotations';
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

  it('drops diagnostics on verses outside the slice and on header lines', () => {
    const chapter = usfmToUsj(USFM);
    const slice = slicePericope(chapter, 1, [2]);

    const outOfSlice = diag(5, 6, 7); // verse 1 line
    const headerLine = diag(1, 0, 2); // \h line
    expect(diagnosticsToAnnotations([outOfSlice, headerLine], USFM, slice)).toEqual([]);
  });
});
