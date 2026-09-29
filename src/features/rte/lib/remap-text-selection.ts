import type { SelectionRange } from '@eten-tech-foundation/platform-editor';
import type { MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

interface TextLeaf {
  path: Extract<SelectionRange['start'], { offset: number }>['jsonPath'];
  text: string;
  start: number;
}

function textLeaves(usj: Usj): TextLeaf[] {
  const leaves: TextLeaf[] = [];
  let offset = 0;
  const visit = (node: string | MarkerObject, path: string): void => {
    if (typeof node === 'string') {
      leaves.push({ path: path as TextLeaf['path'], text: node, start: offset });
      offset += node.length;
    } else node.content?.forEach((child, i) => visit(child, `${path}.content[${i}]`));
  };
  usj.content.forEach((node, i) => visit(node, `$.content[${i}]`));
  return leaves;
}

/** Preserve text endpoints when a structural rewrite changes their USJ paths, but not their text. */
export function remapTextSelection(
  before: Usj | undefined,
  after: Usj,
  selection: SelectionRange | undefined
): SelectionRange | undefined {
  if (!before || !selection) return undefined;
  const oldLeaves = textLeaves(before);
  const newLeaves = textLeaves(after);
  if (oldLeaves.map(leaf => leaf.text).join('') !== newLeaves.map(leaf => leaf.text).join(''))
    return undefined;

  const remap = (point: SelectionRange['start']): SelectionRange['start'] | undefined => {
    if (!('offset' in point)) return undefined;
    const old = oldLeaves.find(leaf => leaf.path === point.jsonPath);
    if (!old || point.offset < 0 || point.offset > old.text.length) return undefined;
    const absolute = old.start + point.offset;
    // Keep a caret at a text leaf's start on the following leaf, not the preceding verse's end.
    const leaf = newLeaves.find(candidate =>
      point.offset === 0
        ? candidate.start === absolute ||
          (candidate.start < absolute && absolute < candidate.start + candidate.text.length)
        : candidate.start < absolute && absolute <= candidate.start + candidate.text.length
    );
    return leaf ? { jsonPath: leaf.path, offset: absolute - leaf.start } : undefined;
  };
  const start = remap(selection.start);
  const end = selection.end ? remap(selection.end) : undefined;
  if (!start || (selection.end && !end)) return undefined;
  return { start, ...(end ? { end } : {}) };
}
