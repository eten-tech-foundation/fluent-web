import { isHeadingMarker } from './heading-markers';

/** The focus end follows both keyboard navigation and backwards selections. */
export function activeVerseRange(editor: HTMLElement, selection: Selection | null) {
  const focus = selection?.focusNode;
  if (!focus || !editor.contains(focus)) return null;
  const element = focus instanceof Element ? focus : focus.parentElement;
  if (isHeadingMarker(element?.closest<HTMLElement>('[data-marker]')?.dataset.marker)) return null;

  const boundaries = [...editor.querySelectorAll<HTMLElement>('[data-marker]')].filter(
    node => node.matches('.verse, .chapter') || isHeadingMarker(node.dataset.marker)
  );
  let start: HTMLElement | undefined;
  for (const boundary of boundaries) {
    const range = document.createRange();
    range.selectNode(boundary);
    if (range.comparePoint(focus, selection.focusOffset) < 0) break;
    start = boundary.matches('.verse') ? boundary : undefined;
  }
  if (!start) return null;

  const range = document.createRange();
  range.setStartBefore(start);
  const end = boundaries.at(boundaries.indexOf(start) + 1);
  if (end) range.setEndBefore(end);
  else range.setEnd(editor, editor.childNodes.length);
  return { verse: start.dataset.number ?? '', range };
}

interface LineRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Text rects avoid full paragraph boxes, which can include the neighbouring verse. */
export function verseLineRects(range: Range): LineRect[] {
  const ancestor = range.commonAncestorContainer;
  const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT);
  const rects: LineRect[] = [];
  let node = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node)) {
      const textRange = document.createRange();
      textRange.selectNodeContents(node);
      for (const rect of textRange.getClientRects()) {
        if (rect.width > 0 && rect.height > 0) {
          const line = rects.find(
            candidate =>
              Math.abs(candidate.top + candidate.height / 2 - (rect.top + rect.height / 2)) <
              Math.min(candidate.height, rect.height) / 2
          );
          if (line) {
            const right = Math.max(line.left + line.width, rect.right);
            const bottom = Math.max(line.top + line.height, rect.bottom);
            line.left = Math.min(line.left, rect.left);
            line.top = Math.min(line.top, rect.top);
            line.width = right - line.left;
            line.height = bottom - line.top;
          } else {
            rects.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
          }
        }
      }
    }
    node = walker.nextNode();
  }
  return rects;
}
