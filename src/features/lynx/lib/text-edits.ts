import type { TextDocument, TextEdit } from '@sillsdev/lynx';

/**
 * Applies Lynx `TextEdit`s (line/character ranges) to the document's current
 * content and returns the new content string. Edits are applied back-to-front
 * so earlier offsets stay valid.
 */
export function applyTextEdits(document: TextDocument, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort(
    (a, b) => document.offsetAt(b.range.start) - document.offsetAt(a.range.start)
  );

  let content = document.getText();
  for (const edit of sorted) {
    const start = document.offsetAt(edit.range.start);
    const end = document.offsetAt(edit.range.end);
    content = content.slice(0, start) + edit.newText + content.slice(end);
  }
  return content;
}
