import { useEffect, useState, type RefObject } from 'react';

import { activeVerseRange, verseLineRects } from '../lib/active-verse';

interface Props {
  surfaceRef: RefObject<HTMLDivElement | null>;
  contentKey: string;
  readOnly: boolean;
  onActiveVerseChange: (verseNumber: number | undefined) => void;
}

interface Outline {
  verse: string;
  rects: Array<{ left: number; top: number; width: number; height: number }>;
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
    const editor = surface?.querySelector<HTMLElement>('.editor-input');
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
      setOutline({
        verse: active.verse,
        rects: verseLineRects(active.range).map(rect => ({
          left: rect.left - origin.left + surface.scrollLeft - surface.clientLeft,
          top: rect.top - origin.top + surface.scrollTop - surface.clientTop,
          width: rect.width,
          height: rect.height,
        })),
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
  return (
    <div aria-hidden='true' className='active-verse-outline' data-active-verse={outline.verse}>
      {outline.rects.map((rect, index) => (
        <span key={index} style={rect} />
      ))}
    </div>
  );
}
