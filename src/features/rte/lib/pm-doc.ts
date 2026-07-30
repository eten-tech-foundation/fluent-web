import { Schema } from 'prosemirror-model';

import type { RteAnnotation } from './lynx-annotations';
import type { MarkerContent, MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';
import type { Node as PmNode } from 'prosemirror-model';

/**
 * Minimal scripture schema for the ProseMirror counterpart: paragraphs with a
 * USFM block marker attr, immutable chapter/book blocks, inline verse atoms.
 * Same modelling choices as the SharedEditor slice (design.md comparison
 * harness): the editor edits verse text and paragraph structure only.
 */
export const usjSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    para: {
      content: 'inline*',
      group: 'block',
      attrs: { marker: { default: 'p' } },
      toDOM: node => ['p', { class: `pm-usj-${node.attrs.marker as string}` }, 0],
    },
    book: {
      group: 'block',
      atom: true,
      selectable: false,
      attrs: { code: {} },
      toDOM: node => ['div', { class: 'pm-book' }, node.attrs.code as string],
    },
    chapter: {
      group: 'block',
      atom: true,
      selectable: false,
      attrs: { number: {} },
      toDOM: node => ['h2', { class: 'pm-chapter' }, node.attrs.number as string],
    },
    verse: {
      inline: true,
      group: 'inline',
      atom: true,
      selectable: false,
      attrs: { number: {}, sid: { default: undefined } },
      toDOM: node => ['sup', { class: 'pm-verse' }, node.attrs.number as string],
    },
    text: { group: 'inline' },
  },
});

export interface UsjDocResult {
  doc: PmNode;
  /** USJ jsonPath of each text string → its start position in the doc. */
  textPositions: Map<string, number>;
}

/** Build a ProseMirror doc from a pericope slice, recording text positions. */
export function usjToDoc(slice: Usj): UsjDocResult {
  const textPositions = new Map<string, number>();
  const blocks: PmNode[] = [];
  let pos = 0;

  slice.content.forEach((node, i) => {
    if (typeof node === 'string') return;
    if (node.type === 'book') {
      blocks.push(usjSchema.nodes.book.create({ code: node.code }));
      pos += 1; // leaf block: nodeSize 1
      return;
    }
    if (node.type === 'chapter') {
      blocks.push(usjSchema.nodes.chapter.create({ number: node.number }));
      pos += 1;
      return;
    }
    if (node.type !== 'para') return;
    const inline: PmNode[] = [];
    pos += 1;
    (node.content ?? []).forEach((item, j) => {
      if (typeof item === 'string') {
        if (item.length === 0) return;
        textPositions.set(`$.content[${i}].content[${j}]`, pos);
        inline.push(usjSchema.text(item));
        pos += item.length;
        return;
      }
      if (item.type === 'verse') {
        inline.push(usjSchema.nodes.verse.create({ number: item.number, sid: item.sid }));
        pos += 1;
      }
    });
    blocks.push(usjSchema.nodes.para.create({ marker: node.marker }, inline));
    pos += 1;
  });

  return { doc: usjSchema.nodes.doc.create(null, blocks), textPositions };
}

/**
 * Serialize the ProseMirror doc back to a slice USJ. Book/chapter blocks are
 * immutable in the editor, so their USJ nodes are taken from `template`
 * (the slice that was loaded) to preserve fields the schema doesn't model.
 */
export function docToUsj(doc: PmNode, template: Usj): Usj {
  const templateBook = template.content.find(
    (n): n is MarkerObject => typeof n !== 'string' && n.type === 'book'
  );
  const templateChapter = template.content.find(
    (n): n is MarkerObject => typeof n !== 'string' && n.type === 'chapter'
  );

  const content: MarkerContent[] = [];
  doc.forEach(block => {
    if (block.type.name === 'book') {
      if (templateBook) content.push(templateBook);
      return;
    }
    if (block.type.name === 'chapter') {
      if (templateChapter) content.push(templateChapter);
      return;
    }
    if (block.type.name !== 'para') return;
    const items: MarkerContent[] = [];
    block.forEach(inline => {
      if (inline.type.name === 'verse') {
        items.push({
          type: 'verse',
          marker: 'v',
          number: inline.attrs.number as string,
          sid: inline.attrs.sid as string | undefined,
        });
        return;
      }
      if (inline.isText && inline.text != null && inline.text.length > 0) {
        const last = items[items.length - 1];
        if (typeof last === 'string') items[items.length - 1] = last + inline.text;
        else items.push(inline.text);
      }
    });
    content.push({ type: 'para', marker: block.attrs.marker as string, content: items });
  });

  return { ...template, content };
}

export interface AnnotationRange {
  from: number;
  to: number;
  type: string;
  id: string;
}

/** Map RteAnnotations onto doc ranges; unknown jsonPaths are dropped. */
export function annotationRanges(
  annotations: readonly RteAnnotation[],
  textPositions: ReadonlyMap<string, number>
): AnnotationRange[] {
  const ranges: AnnotationRange[] = [];
  for (const annotation of annotations) {
    const start = textPositions.get(annotation.selection.start.jsonPath);
    const end = textPositions.get(annotation.selection.end.jsonPath);
    if (start === undefined || end === undefined) continue;
    const from = start + annotation.selection.start.offset;
    const to = end + annotation.selection.end.offset;
    if (to <= from) continue;
    ranges.push({ from, to, type: annotation.type, id: annotation.id });
  }
  return ranges;
}
