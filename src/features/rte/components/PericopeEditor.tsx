import { useCallback, useEffect, useRef } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';

import {
  changedVerses,
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '../lib/pericope-usj';

import '../styles/usj-nodes.css';
import '../styles/editor.css';
import '../styles/pericope-editor.css';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';
import type { SerializedVerseRef } from '@sillsdev/scripture';

export interface PericopeEditorProps {
  /** The pericope's target verses, in order. */
  verses: PericopeVerseText[];
  chapterNumber: number;
  bookCode?: string;
  readOnly?: boolean;
  /** Reloads the editor from `verses` when this changes, e.g. on chapter navigation. */
  contentKey: string;
  /** Called with only the verses whose text changed. */
  onVersesChange: (changed: PericopeVerseText[]) => void;
  /** The verse the cursor is in, for the drafting surface's active-verse tracking. */
  onActiveVerseChange?: (verseNumber: number) => void;
}

/**
 * Rich text editing for one pericope, replacing the per-verse textareas (#314).
 *
 * The editor is **uncontrolled**: it owns the document once loaded, and this component mirrors
 * edits back out as verse rows. Feeding every keystroke back in as a new `usj` prop would fight
 * the editor for the cursor, so it is written back into only in two cases: `contentKey` changed,
 * or the parent filled a verse the editor holds empty (the AI suggestion path).
 *
 * Paragraph breaks the translator creates are real in the editor but are flattened away by
 * `usjToPericopeVerses`, because `translated_verses` has nowhere to store them (fluent-api#263).
 */
export function PericopeEditor({
  verses,
  chapterNumber,
  bookCode,
  readOnly = false,
  contentKey,
  onVersesChange,
  onActiveVerseChange,
}: PericopeEditorProps) {
  const editorRef = useRef<EditorRef | null>(null);
  const loadedKeyRef = useRef(contentKey);
  /** What the editor's own document holds, to diff each commit against. */
  const knownVersesRef = useRef<PericopeVerseText[]>(verses);
  /** USJ we pushed in ourselves; the editor echoes it straight back and that is not an edit. */
  const suppressedJsonRef = useRef('');

  const loadIntoEditor = useCallback(
    (next: PericopeVerseText[]) => {
      knownVersesRef.current = next;
      const usj = pericopeVersesToUsj(next, chapterNumber, bookCode);
      suppressedJsonRef.current = JSON.stringify(usj);
      editorRef.current?.setUsj(usj);
    },
    [bookCode, chapterNumber]
  );

  // Text the parent wrote that the editor never held: the drafting surface fills an empty verse
  // with its AI suggestion. It has to reach the document, or the translator never sees it and the
  // next commit reports the verse as emptied and writes the suggestion away. Verses the editor
  // already has text in are left alone, since that text is what the translator is looking at.
  useEffect(() => {
    if (contentKey !== loadedKeyRef.current) return;

    const known = knownVersesRef.current;
    const merged = known.map(verse => {
      if (verse.text !== '') return verse;
      const incoming = verses.find(candidate => candidate.verseNumber === verse.verseNumber);
      return incoming && incoming.text !== '' ? { ...verse, text: incoming.text } : verse;
    });

    // Untouched entries come back by reference, so identity is the whole test.
    if (merged.some((verse, index) => verse !== known[index])) loadIntoEditor(merged);
  }, [contentKey, loadIntoEditor, verses]);

  useEffect(() => {
    if (contentKey === loadedKeyRef.current) return;
    loadedKeyRef.current = contentKey;
    loadIntoEditor(verses);
  }, [contentKey, loadIntoEditor, verses]);

  const handleUsjChange = useCallback(
    (usj: Usj) => {
      const json = JSON.stringify(usj);
      if (json === suppressedJsonRef.current) return;
      suppressedJsonRef.current = json;

      const derived = usjToPericopeVerses(usj);
      const changed = changedVerses(knownVersesRef.current, derived);
      if (changed.length === 0) return;

      knownVersesRef.current = knownVersesRef.current.map(verse => {
        const update = changed.find(c => c.verseNumber === verse.verseNumber);
        return update ? { ...verse, text: update.text } : verse;
      });
      onVersesChange(changed);
    },
    [onVersesChange]
  );

  const handleScrRefChange = useCallback(
    (scrRef: SerializedVerseRef) => {
      if (scrRef.verseNum > 0) onActiveVerseChange?.(scrRef.verseNum);
    },
    [onActiveVerseChange]
  );

  return (
    <div className='pericope-editor' data-testid='pericope-editor'>
      <Editorial
        ref={editorRef}
        defaultUsj={pericopeVersesToUsj(verses, chapterNumber, bookCode)}
        options={{
          isReadonly: readOnly,
          // The drafting page supplies its own controls; the built-in toolbar would repeat once
          // per pericope box.
          hasExternalUI: true,
          hasSpellCheck: false,
          textDirection: 'auto',
        }}
        onScrRefChange={handleScrRefChange}
        onUsjChange={handleUsjChange}
      />
    </div>
  );
}
