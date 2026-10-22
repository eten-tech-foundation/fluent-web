import { useEffect, useState, type RefObject } from 'react';

import {
  activeVerseRange,
  outlinePath,
  verseLineRects,
  verseOutlineShapes,
} from '../lib/active-verse';
import { EDITOR_SELECTOR } from '../lib/editor-dom';

/** How far the outline stands off the text, and how round its corners are, in pixels. */
const OUTLINE_GAP = 3;
const OUTLINE_RADIUS = 2;

interface Props {
  surfaceRef: RefObject<HTMLDivElement | null>;
  contentKey: string;
  readOnly: boolean;
  onActiveVerseChange: (verseNumber: number | undefined) => void;
}

interface Outline {
  verse: string;
  /** Where the drawing sits in the surface; `paths` are relative to it. */
  box: { left: number; top: number; width: number; height: number };
  paths: string[];
}

/** Paint outside Lexical's content: decorations must never become saved scripture or undo steps. */
export function ActiveVerseOutline({
  surfaceRef,
  contentKey,
  readOnly,
  onActiveVerseChange,
}: Props) {
  const [outline, setOutline] = useState<Outline | null>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    const editor = surface?.querySelector<HTMLElement>(EDITOR_SELECTOR);
    if (!surface || !editor || readOnly) {
      setOutline(null);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const active = activeVerseRange(editor, document.getSelection());
      onActiveVerseChange(active ? Number(active.verse) : undefined);
      if (!active) {
        setOutline(null);
        return;
      }
      const origin = surface.getBoundingClientRect();
      const lines = verseLineRects(active.range).map(rect => ({
        left: rect.left - origin.left + surface.scrollLeft - surface.clientLeft,
        top: rect.top - origin.top + surface.scrollTop - surface.clientTop,
        width: rect.width,
        height: rect.height,
      }));
      const shapes = verseOutlineShapes(lines, OUTLINE_GAP);
      if (shapes.length === 0) {
        setOutline({
          verse: active.verse,
          box: { left: 0, top: 0, width: 0, height: 0 },
          paths: [],
        });
        return;
      }
      const xs = shapes.flat().map(([x]) => x);
      const ys = shapes.flat().map(([, y]) => y);
      const left = Math.floor(Math.min(...xs)) - 1;
      const top = Math.floor(Math.min(...ys)) - 1;
      setOutline({
        verse: active.verse,
        box: {
          left,
          top,
          width: Math.ceil(Math.max(...xs)) + 2 - left,
          height: Math.ceil(Math.max(...ys)) + 2 - top,
        },
        paths: shapes.map(shape =>
          outlinePath(
            shape.map(([x, y]) => [x - left, y - top] as const),
            OUTLINE_RADIUS
          )
        ),
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(editor, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'dir', 'data-marker'],
      subtree: true,
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(editor);
    resize.observe(surface);
    document.addEventListener('selectionchange', schedule);
    document.addEventListener('scroll', schedule, true);
    const canObserveFonts = typeof document.fonts !== 'undefined';
    if (canObserveFonts) document.fonts.addEventListener('loadingdone', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      document.removeEventListener('selectionchange', schedule);
      document.removeEventListener('scroll', schedule, true);
      if (canObserveFonts) document.fonts.removeEventListener('loadingdone', schedule);
    };
  }, [contentKey, onActiveVerseChange, readOnly, surfaceRef]);

  if (!outline) return null;
  const { box, paths } = outline;
  return (
    <div aria-hidden='true' className='active-verse-outline' data-active-verse={outline.verse}>
      {paths.length > 0 && (
        <svg height={box.height} style={{ left: box.left, top: box.top }} width={box.width}>
          {paths.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </svg>
      )}
    </div>
  );
}
