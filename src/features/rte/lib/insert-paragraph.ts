import { isHeadingMarker } from './heading-markers';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject } from '@eten-tech-foundation/scripture-utilities';

function length(node: string | MarkerObject): number {
  if (typeof node === 'string') return node.length;
  if (node.type === 'para' || node.type === 'char')
    return (
      (node.content ?? []).reduce((sum, child) => sum + length(child), 0) +
      (node.type === 'para' ? 1 : 0)
    );
  return 1;
}

/** Insert at a caret only: a toolbar action must never replace selected scripture. */
export function insertParagraph(editor: EditorRef): boolean {
  const selection = editor.getSelection();
  if (!selection) return false;
  if (
    selection.end &&
    (selection.start.jsonPath !== selection.end.jsonPath ||
      selection.start.offset !== selection.end.offset)
  )
    return false;

  const usj = editor.getUsj();
  const index = /^\$\.content\[(\d+)\]/.exec(selection.start.jsonPath)?.[1];
  if (!usj || index === undefined || Number(index) >= usj.content.length) return false;
  const block = usj.content[Number(index)];
  if (typeof block === 'string' || block.type !== 'para') return false;

  if (isHeadingMarker(block.marker)) {
    // A title is not verse text. Insert in its following verse without splitting the title.
    const next = usj.content.findIndex(
      (node, i) =>
        i > Number(index) &&
        typeof node !== 'string' &&
        node.type === 'para' &&
        !isHeadingMarker(node.marker) &&
        node.content?.some(item => typeof item !== 'string' && item.type === 'verse')
    );
    const body = usj.content[next];
    if (!body || typeof body === 'string' || !body.content) return false;
    const verseIndex = body.content.findIndex(
      item => typeof item !== 'string' && item.type === 'verse'
    );
    const offset =
      usj.content.slice(0, next).reduce((sum, child) => sum + length(child), 0) +
      body.content.slice(0, verseIndex + 1).reduce((sum, child) => sum + length(child), 0);
    // Keep following Poetry unchanged. The two temporary spaces host the caret beside the
    // verse number; the save path trims them once the translator adds text.
    editor.applyUpdate(
      [
        { retain: offset },
        { insert: '  ' },
        { insert: '\n', attributes: { para: { style: 'p' } } },
      ],
      'local'
    );
    editor.setSelection({
      start: { jsonPath: `$.content[${next}].content[${verseIndex + 1}]`, offset: 0 },
    });
    editor.getSelection();
    return true;
  }

  const indices = [...selection.start.jsonPath.matchAll(/\.content\[(\d+)\]/g)]
    .map(match => Number(match[1]))
    .slice(1);
  let node: string | MarkerObject = block;
  let inside = 0;
  for (const childIndex of indices) {
    if (typeof node === 'string' || !node.content?.[childIndex]) return false;
    inside += node.content.slice(0, childIndex).reduce((sum, child) => sum + length(child), 0);
    node = node.content[childIndex];
  }
  if (typeof node === 'string') inside += selection.start.offset;
  else if (node.type === 'para' || node.type === 'char')
    inside += (node.content ?? [])
      .slice(0, selection.start.offset)
      .reduce((sum, child) => sum + length(child), 0);
  else return false;

  const before = usj.content.slice(0, Number(index)).reduce((sum, child) => sum + length(child), 0);
  const tail = length(block) - 1 - inside;
  if (tail < 0) return false;
  if (tail === 0 && block.marker !== 'p') {
    editor.applyUpdate(
      [
        { retain: before + inside + 1 },
        { insert: '  ' },
        { insert: '\n', attributes: { para: { style: 'p' } } },
      ],
      'local'
    );
    editor.setSelection({ start: { jsonPath: `$.content[${Number(index) + 1}]`, offset: 0 } });
    editor.getSelection();
    return true;
  }
  // A local delta keeps undo history and synchronizes USJ immediately. Editorial 0.8.15's
  // insertMarker splits the DOM but can leave getUsj/onUsjChange at the preceding document.
  editor.applyUpdate(
    [
      { retain: before + inside },
      { insert: '\n', attributes: { para: { style: block.marker ?? 'p' } } },
      ...(block.marker !== 'p'
        ? [
            ...(tail ? [{ retain: tail }] : []),
            { delete: 1 },
            { insert: '\n', attributes: { para: { style: 'p' } } },
          ]
        : []),
    ],
    'local'
  );
  editor.setSelection({ start: { jsonPath: `$.content[${Number(index) + 1}]`, offset: 0 } });
  // Flush the selection-only update before immediate typing can be grouped under its tag.
  editor.getSelection();
  return true;
}
