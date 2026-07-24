import type { MarkerContent, MarkerObject, Usj } from '@eten-tech-foundation/scripture-utilities';

interface Para {
  type: 'para';
  marker: string;
  content: MarkerContent[];
}

function isPara(node: MarkerContent): node is MarkerObject & Para {
  return typeof node !== 'string' && node.type === 'para';
}

function isChapter(node: MarkerContent): node is MarkerObject {
  return typeof node !== 'string' && node.type === 'chapter';
}

/**
 * Walks chapter content tracking which chapter/verse each item belongs to and
 * calls `visit` for every para item with its selection status. Selection =
 * item belongs to `chapterNumber` + one of `verseNumbers`. Verse tracking
 * carries across paragraphs (continuation paragraphs).
 */
function walkParas(
  content: MarkerContent[],
  chapterNumber: number,
  verseNumbers: number[],
  handlers: {
    onOther: (node: MarkerContent) => void;
    onParaStart: (para: Para) => void;
    onItem: (item: MarkerContent, selected: boolean) => void;
    onParaEnd: () => void;
  }
): void {
  const selectedSet = new Set(verseNumbers);
  let currentChapter = 0;
  let currentVerseSelected = false;

  for (const node of content) {
    if (isChapter(node)) {
      currentChapter = Number.parseInt(node.number ?? '0', 10);
      currentVerseSelected = false;
      handlers.onOther(node);
      continue;
    }
    if (!isPara(node)) {
      handlers.onOther(node);
      continue;
    }
    handlers.onParaStart(node);
    for (const item of node.content) {
      if (typeof item !== 'string' && item.type === 'verse') {
        currentVerseSelected =
          currentChapter === chapterNumber &&
          selectedSet.has(Number.parseInt(item.number ?? '0', 10));
      }
      handlers.onItem(item, currentVerseSelected);
    }
    handlers.onParaEnd();
  }
}

/**
 * Returns a mini-USJ for the editor: the book node (if any), the chapter node,
 * and the paragraphs covering only `verseNumbers` of `chapterNumber`. When a
 * paragraph spans the pericope boundary it is split at the boundary.
 */
export function slicePericope(chapterUsj: Usj, chapterNumber: number, verseNumbers: number[]): Usj {
  const content: MarkerContent[] = [];

  const bookNode = chapterUsj.content.find(
    (node): node is MarkerObject => typeof node !== 'string' && node.type === 'book'
  );
  if (bookNode) content.push(bookNode);
  const chapterNode = chapterUsj.content.find(
    (node): node is MarkerObject =>
      isChapter(node) && Number.parseInt(node.number ?? '0', 10) === chapterNumber
  );
  if (chapterNode) content.push(chapterNode);

  let paraBuffer: Para | null = null;
  walkParas(chapterUsj.content, chapterNumber, verseNumbers, {
    onOther: () => {},
    onParaStart: para => {
      paraBuffer = { type: 'para', marker: para.marker, content: [] };
    },
    onItem: (item, selected) => {
      if (selected) paraBuffer?.content.push(item);
    },
    onParaEnd: () => {
      if (paraBuffer && paraBuffer.content.length > 0) content.push(paraBuffer);
      paraBuffer = null;
    },
  });

  return { ...chapterUsj, content };
}

/**
 * Merges an edited pericope slice back into the chapter USJ, replacing the
 * content that covers `verseNumbers`. The edited slice's paragraphs are
 * inserted where the pericope started; paragraph boundaries at the pericope
 * edges are preserved as boundaries (documented PoC semantics).
 */
export function mergePericope(
  chapterUsj: Usj,
  editedSlice: Usj,
  chapterNumber: number,
  verseNumbers: number[]
): Usj {
  const editedParas = editedSlice.content.filter(isPara);
  const content: MarkerContent[] = [];
  let inserted = false;
  let paraBuffer: Para | null = null;
  let currentMarker = 'p';

  const flushBuffer = (): void => {
    if (paraBuffer && paraBuffer.content.length > 0) content.push(paraBuffer);
    paraBuffer = null;
  };

  walkParas(chapterUsj.content, chapterNumber, verseNumbers, {
    onOther: node => content.push(node),
    onParaStart: para => {
      currentMarker = para.marker;
      paraBuffer = { type: 'para', marker: para.marker, content: [] };
    },
    onItem: (item, selected) => {
      if (!selected) {
        paraBuffer ??= { type: 'para', marker: currentMarker, content: [] };
        paraBuffer.content.push(item);
        return;
      }
      // First selected item: flush what came before it and drop in the edited paras.
      if (!inserted) {
        flushBuffer();
        content.push(...editedParas);
        inserted = true;
      }
      // Selected items themselves are replaced by the edited slice.
    },
    onParaEnd: flushBuffer,
  });

  return { ...chapterUsj, content };
}
