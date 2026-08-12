import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';

import {
  changedVerses,
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '../lib/pericope-usj';

import { FormatBar } from './FormatBar';

import '../styles/usj-nodes.css';
import '../styles/editor.css';
import '../styles/pericope-editor.css';
import '../styles/chapter-editor.css';

import type { EditorRef, StateChangeSnapshot } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';
import type { SerializedVerseRef } from '@sillsdev/scripture';

export interface ChapterEditorProps {
  /** Every verse of the chapter, in order. */
  verses: PericopeVerseText[];
  chapterNumber: number;
  bookCode?: string;
  readOnly?: boolean;
  /** Reloads the editor from `verses` when this changes, e.g. on chapter navigation. */
  contentKey: string;
  onVersesChange: (changed: PericopeVerseText[]) => void;
  onActiveVerseChange?: (verseNumber: number) => void;
}

/**
 * The whole chapter as one continuous editing surface (#397).
 *
 * Deliberately the same document pipeline as the pericope view: one editor, the chapter's verses
 * instead of a pericope's. The requirement that all three views read and write the same data is
 * met by construction rather than by keeping two conversions in step.
 *
 * What is new here is the format bar, and that the pane scrolls on its own — chapter view drops
 * the paired-row layout the other views scroll inside, so the source and target scrollbars are
 * independent (the drift that layout used to hide is answered by the two panes being separate
 * documents, not by pretending they line up).
 */
export function ChapterEditor({
  verses,
  chapterNumber,
  bookCode,
  readOnly = false,
  contentKey,
  onVersesChange,
  onActiveVerseChange,
}: ChapterEditorProps) {
  const editorRef = useRef<EditorRef | null>(null);
  const loadedKeyRef = useRef(contentKey);
  /** What the editor's document holds, to diff each commit against. */
  const knownVersesRef = useRef<PericopeVerseText[]>([]);
  const suppressedJsonRef = useRef('');
  const [blockMarker, setBlockMarker] = useState<string | undefined>();

  const initialUsj = useMemo(
    () => pericopeVersesToUsj(verses, chapterNumber, bookCode),
    // Keyed on the chapter's identity, not `verses`: a new object every keystroke would be a new
    // document for the editor to fight the cursor over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentKey]
  );

  useEffect(() => {
    knownVersesRef.current = usjToPericopeVerses(initialUsj);
  }, [initialUsj]);

  useEffect(() => {
    if (contentKey === loadedKeyRef.current) return;
    loadedKeyRef.current = contentKey;

    const usj = pericopeVersesToUsj(verses, chapterNumber, bookCode);
    knownVersesRef.current = usjToPericopeVerses(usj);
    suppressedJsonRef.current = JSON.stringify(usj);
    editorRef.current?.setUsj(usj);
  }, [bookCode, chapterNumber, contentKey, verses]);

  const handleUsjChange = useCallback(
    (usj: Usj) => {
      const json = JSON.stringify(usj);
      if (json === suppressedJsonRef.current) return;
      suppressedJsonRef.current = json;

      const derived = usjToPericopeVerses(usj);
      const changed = changedVerses(knownVersesRef.current, derived);
      knownVersesRef.current = derived;
      if (changed.length > 0) onVersesChange(changed);
    },
    [onVersesChange]
  );

  const handleScrRefChange = useCallback(
    (scrRef: SerializedVerseRef) => {
      if (scrRef.verseNum > 0) onActiveVerseChange?.(scrRef.verseNum);
    },
    [onActiveVerseChange]
  );

  const handleStateChange = useCallback((snapshot: StateChangeSnapshot) => {
    setBlockMarker(snapshot.blockMarker);
  }, []);

  const handleFormat = useCallback((marker: string) => {
    editorRef.current?.formatPara(marker);
    // The editor reports the new block through onStateChange, but only once it has committed;
    // reflecting it now keeps the bar from lagging a click behind.
    setBlockMarker(marker);
  }, []);

  return (
    <div className='chapter-editor flex h-full min-h-0 flex-col' data-testid='chapter-editor'>
      {!readOnly && <FormatBar blockMarker={blockMarker} onFormat={handleFormat} />}
      <div className='chapter-editor-surface min-h-0 flex-1 overflow-y-auto px-6 py-4'>
        <Editorial
          ref={editorRef}
          defaultUsj={initialUsj}
          options={{
            isReadonly: readOnly,
            hasExternalUI: true,
            hasSpellCheck: false,
            textDirection: 'auto',
          }}
          onScrRefChange={handleScrRefChange}
          onStateChange={handleStateChange}
          onUsjChange={handleUsjChange}
        />
      </div>
    </div>
  );
}
