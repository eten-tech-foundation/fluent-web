import {
  ScriptureBook,
  ScriptureChapter,
  ScriptureNodeType,
  ScriptureParagraph,
  ScriptureText,
  ScriptureVerse,
} from '@sillsdev/lynx';

import type { Position, Range, ScriptureNode } from '@sillsdev/lynx';
import type { UsfmDocument } from '@sillsdev/lynx-usfm';

export interface VerseSnapshot {
  number: string;
  /** Verse text reassembled from the typed node tree (not regex). */
  text: string;
  range: Range;
}

export interface ChapterSnapshot {
  number: string;
  verses: VerseSnapshot[];
}

export interface TreeNodeSnapshot {
  type: string;
  label: string;
  range: Range;
  depth: number;
}

export interface StructureSnapshot {
  bookCode: string | undefined;
  chapters: ChapterSnapshot[];
  /** Flat pre-order listing of the node tree for the structure panel. */
  tree: TreeNodeSnapshot[];
}

function labelFor(node: ScriptureNode): string {
  if (node instanceof ScriptureBook) {
    return `\\id ${node.code}`;
  }
  if (node instanceof ScriptureChapter) {
    return `\\c ${node.number}`;
  }
  if (node instanceof ScriptureVerse) {
    return `\\v ${node.number}`;
  }
  if (node instanceof ScriptureParagraph) {
    return `\\${node.style}`;
  }
  if (node instanceof ScriptureText) {
    const text = node.text.trim();
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }
  return ScriptureNodeType[node.type];
}

/** Walks the typed ScriptureDocument node tree into plain render-friendly data. */
export function snapshotStructure(document: UsfmDocument): StructureSnapshot {
  const tree: TreeNodeSnapshot[] = [];
  const walk = (node: ScriptureNode, depth: number): void => {
    tree.push({
      type: ScriptureNodeType[node.type],
      label: labelFor(node),
      range: node.range,
      depth,
    });
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  };
  for (const child of document.children) {
    walk(child, 0);
  }

  let bookCode: string | undefined;
  const chapters: ChapterSnapshot[] = [];
  let currentVerse: VerseSnapshot | undefined;

  for (const node of document.findNodes([
    ScriptureNodeType.Book,
    ScriptureNodeType.Chapter,
    ScriptureNodeType.Verse,
    ScriptureNodeType.Text,
  ])) {
    if (node instanceof ScriptureBook) {
      bookCode = node.code;
    } else if (node instanceof ScriptureChapter) {
      chapters.push({ number: node.number, verses: [] });
      currentVerse = undefined;
    } else if (node instanceof ScriptureVerse) {
      currentVerse = { number: node.number, text: '', range: node.range };
      chapters.at(-1)?.verses.push(currentVerse);
    } else if (node instanceof ScriptureText && currentVerse != null) {
      currentVerse.text += node.text;
    }
  }

  return { bookCode, chapters, tree };
}

function isBefore(a: Position, b: Position): boolean {
  return a.line !== b.line ? a.line < b.line : a.character <= b.character;
}

/** Resolves the verse reference (e.g. "RUT 1:5") enclosing a diagnostic range. */
export function verseRefAtRange(document: UsfmDocument, range: Range): string | undefined {
  let bookCode: string | undefined;
  let chapterNumber: string | undefined;
  let match: { chapter: string; verse: string } | undefined;

  for (const node of document.findNodes([
    ScriptureNodeType.Book,
    ScriptureNodeType.Chapter,
    ScriptureNodeType.Verse,
  ])) {
    if (node instanceof ScriptureBook) {
      bookCode = node.code;
    } else if (node instanceof ScriptureChapter) {
      chapterNumber = node.number;
    } else if (
      node instanceof ScriptureVerse &&
      chapterNumber != null &&
      isBefore(node.range.start, range.start)
    ) {
      match = { chapter: chapterNumber, verse: node.number };
    }
  }

  if (match == null) {
    return undefined;
  }
  return `${bookCode ?? '?'} ${match.chapter}:${match.verse}`;
}
