import { usjJsonPathFromIndexes } from '@eten-tech-foundation/scripture-utilities';
import { DiagnosticSeverity } from '@sillsdev/lynx';

import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';
import type { Diagnostic } from '@sillsdev/lynx';

export interface RteAnnotation {
  id: string;
  /** Annotation type (drives the editor's styling class). */
  type: string;
  message: string;
  selection: {
    start: { jsonPath: string; offset: number };
    end: { jsonPath: string; offset: number };
  };
}

interface LineInfo {
  chapter: number;
  verse: number;
  /** Column where the line's verse text starts (after the `\v N ` prefix). */
  textStartCol: number;
  /** 0-based index of this line among the verse's text-bearing lines. */
  pieceIndex: number;
}

/** Which chapter/verse each assembled-USFM line belongs to; null for header/marker lines. */
function indexUsfmLines(usfm: string): Array<LineInfo | null> {
  const infos: Array<LineInfo | null> = [];
  let chapter = 0;
  let verse = 0;
  let pieceIndex = 0;

  for (const line of usfm.split('\n')) {
    const chapterMatch = /^\\c (\d+)/.exec(line);
    if (chapterMatch) {
      chapter = Number.parseInt(chapterMatch[1], 10);
      verse = 0;
      infos.push(null);
      continue;
    }
    const verseMatch = /^(\\v (\d+) )/.exec(line);
    if (verseMatch) {
      verse = Number.parseInt(verseMatch[2], 10);
      pieceIndex = 0;
      infos.push({ chapter, verse, textStartCol: verseMatch[1].length, pieceIndex });
      pieceIndex += 1;
      continue;
    }
    if (verse > 0 && !line.startsWith('\\') && line.trim() !== '') {
      infos.push({ chapter, verse, textStartCol: 0, pieceIndex });
      pieceIndex += 1;
      continue;
    }
    infos.push(null);
  }
  return infos;
}

interface TextPiece {
  jsonPath: string;
  length: number;
}

/** For each verse in the slice, its text nodes in order, addressed by jsonPath. */
function indexSliceTextNodes(sliceUsj: Usj): {
  chapter: number;
  pieces: Map<number, TextPiece[]>;
} {
  const pieces = new Map<number, TextPiece[]>();
  let chapter = 0;
  let verse = 0;

  sliceUsj.content.forEach((node, nodeIndex) => {
    if (typeof node === 'string') return;
    const marker = node as MarkerObject;
    if (marker.type === 'chapter') {
      chapter = Number.parseInt(marker.number ?? '0', 10);
      return;
    }
    if (marker.type !== 'para' || !marker.content) return;
    marker.content.forEach((item, itemIndex) => {
      if (typeof item === 'string') {
        if (verse === 0) return;
        const list = pieces.get(verse) ?? [];
        list.push({
          jsonPath: usjJsonPathFromIndexes([nodeIndex, itemIndex]),
          length: item.length,
        });
        pieces.set(verse, list);
        return;
      }
      if (item.type === 'verse') verse = Number.parseInt(item.number ?? '0', 10);
    });
  });
  return { chapter, pieces };
}

function severityToType(severity: DiagnosticSeverity): string {
  if (severity === DiagnosticSeverity.Error) return 'error';
  if (severity === DiagnosticSeverity.Warning) return 'warning';
  return 'info';
}

/**
 * The spike-3 bridge as app code: maps Lynx diagnostics (line/char ranges over
 * the assembled chapter USFM) onto AnnotationRanges (jsonPath + offset) valid
 * inside the pericope slice currently loaded in the editor. Diagnostics that
 * fall outside the slice's verses, or on header lines, are dropped.
 */
export function diagnosticsToAnnotations(
  diagnostics: readonly Diagnostic[],
  assembledUsfm: string,
  sliceUsj: Usj
): RteAnnotation[] {
  const lineInfos = indexUsfmLines(assembledUsfm);
  const slice = indexSliceTextNodes(sliceUsj);
  const annotations: RteAnnotation[] = [];

  diagnostics.forEach((diagnostic, index) => {
    const info = lineInfos[diagnostic.range.start.line];
    if (info?.chapter !== slice.chapter) return;
    const piece = slice.pieces.get(info.verse)?.[info.pieceIndex];
    if (!piece) return;

    const startOffset = Math.max(0, diagnostic.range.start.character - info.textStartCol);
    const sameLine = diagnostic.range.end.line === diagnostic.range.start.line;
    const endOffset = sameLine
      ? Math.max(startOffset, diagnostic.range.end.character - info.textStartCol)
      : piece.length;

    annotations.push({
      id: `lynx-${index}`,
      type: severityToType(diagnostic.severity),
      message: diagnostic.message,
      selection: {
        start: { jsonPath: piece.jsonPath, offset: Math.min(startOffset, piece.length) },
        end: { jsonPath: piece.jsonPath, offset: Math.min(endOffset, piece.length) },
      },
    });
  });
  return annotations;
}
