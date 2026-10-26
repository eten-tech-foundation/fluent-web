import { SCRIPTURE_MARKER_SELECTOR, VERSE_MARKER_SELECTOR, elementAt } from './editor-dom';
import { isHeadingMarker } from './heading-markers';

/** The focus end follows both keyboard navigation and backwards selections. */
export function activeVerseRange(editor: HTMLElement, selection: Selection | null) {
  const focus = selection?.focusNode;
  if (!focus || !editor.contains(focus)) return null;
  const element = elementAt(focus);
  if (isHeadingMarker(element?.closest<HTMLElement>('[data-marker]')?.dataset.marker)) return null;

  const boundaries = [...editor.querySelectorAll<HTMLElement>('[data-marker]')].filter(
    node => node.matches(SCRIPTURE_MARKER_SELECTOR) || isHeadingMarker(node.dataset.marker)
  );
  let start: HTMLElement | undefined;
  for (const boundary of boundaries) {
    const range = document.createRange();
    range.selectNode(boundary);
    if (range.comparePoint(focus, selection.focusOffset) < 0) break;
    start = boundary.matches(VERSE_MARKER_SELECTOR) ? boundary : undefined;
  }
  if (!start) return null;

  const range = document.createRange();
  range.setStartBefore(start);
  const end = boundaries.at(boundaries.indexOf(start) + 1);
  if (end) range.setEndBefore(end);
  else range.setEnd(editor, editor.childNodes.length);
  return { verse: start.dataset.number ?? '', range };
}

export interface LineRect {
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

export type OutlinePoint = readonly [x: number, y: number];

interface Band {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The outline around a verse's lines, drawn the way a text selection is. A frame per line would
 * stack when wrapped: the text plus the gap runs past the line spacing, so each frame crosses the
 * next. Instead, lines that share horizontal space become one shape, and two lines meet halfway
 * through the space between them, so nothing overlaps and nothing is left open. A line that shares
 * no horizontal space with the one above (a short last line left of a late start) gets its own
 * shape, touching the first at that same halfway line.
 */
export function verseOutlineShapes(lines: LineRect[], gap: number): OutlinePoint[][] {
  const sorted = [...lines].sort((a, b) => a.top - b.top);
  const bands: Band[] = sorted.map((line, index) => {
    const previous = index > 0 ? sorted[index - 1] : undefined;
    const next = sorted.at(index + 1);
    return {
      left: line.left - gap,
      right: line.left + line.width + gap,
      top: previous ? (previous.top + previous.height + line.top) / 2 : line.top - gap,
      bottom: next ? (line.top + line.height + next.top) / 2 : line.top + line.height + gap,
    };
  });

  const shapes: OutlinePoint[][] = [];
  let run: Band[] = [];
  const close = () => {
    if (run.length === 0) return;
    // Down the right edges, then back up the left edges.
    const right = run.flatMap(band => [
      [band.right, band.top] as const,
      [band.right, band.bottom] as const,
    ]);
    const left = [...run]
      .reverse()
      .flatMap(band => [[band.left, band.bottom] as const, [band.left, band.top] as const]);
    shapes.push(corners([...right, ...left]));
    run = [];
  };
  for (const band of bands) {
    const above = run.at(-1);
    if (above && !(band.left < above.right && above.left < band.right)) close();
    run.push(band);
  }
  close();
  return shapes;
}

/** Only the points where the outline turns: no repeats, none partway along a straight edge. */
function corners(points: readonly OutlinePoint[]): OutlinePoint[] {
  const distinct = points.filter((point, index) =>
    index === 0
      ? point[0] !== points.at(-1)?.[0] || point[1] !== points.at(-1)?.[1]
      : point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]
  );
  return distinct.filter((point, index) => {
    const before = distinct[(index + distinct.length - 1) % distinct.length];
    const after = distinct[(index + 1) % distinct.length];
    const turn =
      (point[0] - before[0]) * (after[1] - point[1]) -
      (point[1] - before[1]) * (after[0] - point[0]);
    return turn !== 0;
  });
}

/**
 * An SVG path along `shape`, its corners rounded by up to `radius`. Points sit on half pixels so
 * a one-pixel stroke draws sharp instead of blurring across two rows.
 */
export function outlinePath(shape: readonly OutlinePoint[], radius: number): string {
  const points = corners(
    shape.map(([x, y]) => [Math.round(x) + 0.5, Math.round(y) + 0.5] as const)
  );
  const toward = (from: OutlinePoint, to: OutlinePoint, distance: number) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    return [
      from[0] + ((to[0] - from[0]) / length) * distance,
      from[1] + ((to[1] - from[1]) / length) * distance,
    ] as const;
  };
  const format = ([x, y]: OutlinePoint) => `${Number(x.toFixed(2))} ${Number(y.toFixed(2))}`;
  const turns = points.map((point, index) => {
    const before = points[(index + points.length - 1) % points.length];
    const after = points[(index + 1) % points.length];
    const round = Math.min(
      radius,
      Math.hypot(point[0] - before[0], point[1] - before[1]) / 2,
      Math.hypot(after[0] - point[0], after[1] - point[1]) / 2
    );
    const enter = toward(point, before, round);
    const leave = toward(point, after, round);
    return `${index === 0 ? 'M' : 'L'}${format(enter)}Q${format(point)} ${format(leave)}`;
  });
  return `${turns.join('')}Z`;
}
