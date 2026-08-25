import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';

import { useVerseCursorRestore } from '../hooks/useVerseCursorRestore';
import {
  changedVerses,
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '../lib/pericope-usj';
import { scopeBlockFormatToVerse } from '../lib/scoped-block-format';

import { FormatBar } from './FormatBar';

import '../styles/usj-nodes.css';
import '../styles/editor.css';
import '../styles/editor-shared.css';
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
  /** Called with only the verses whose text or paragraph markers changed. */
  onVersesChange: (changed: PericopeVerseText[]) => void;
  /** The verse the cursor is in, for the drafting surface's active-verse tracking. */
  onActiveVerseChange?: (verseNumber: number) => void;
}

/**
 * The whole chapter as one continuous editing surface (#397).
 *
 * Deliberately the same document pipeline as the pericope view: one editor, the chapter's verses
 * instead of a pericope's. The requirement that all three views read and write the same data is
 * met by construction rather than by keeping two conversions in step. The wrapper contract is the
 * same one `PericopeEditor` keeps, down to the AI suggestion path, for the same reason.
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
  /**
   * What the editor's own document holds, to diff each commit against — kept in *document space*
   * (the rows re-derived from the document we built), never the raw props. The document makes a
   * legacy verse's opening paragraph explicit, so diffing raw rows against a derived commit would
   * report that upgrade as an edit on every mount.
   *
   * Built here rather than in an effect: the editor commits the document it was mounted with, and
   * a child's effects run before its parent's, so an effect would leave the first commit to be
   * diffed against nothing. The AI fill below reads this too, and it has the same problem.
   */
  const knownVersesRef = useRef<PericopeVerseText[]>(
    usjToPericopeVerses(pericopeVersesToUsj(verses, chapterNumber, bookCode))
  );
  /** USJ we pushed in ourselves; the editor echoes it straight back and that is not an edit. */
  const suppressedJsonRef = useRef('');
  const [blockMarker, setBlockMarker] = useState<string | undefined>();

  const initialUsj = useMemo(
    () => pericopeVersesToUsj(verses, chapterNumber, bookCode),
    // Keyed on the chapter's identity, not `verses`: a new object every keystroke would be a new
    // document for the editor to fight the cursor over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentKey]
  );

  const loadIntoEditor = useCallback(
    (next: PericopeVerseText[]) => {
      const usj = pericopeVersesToUsj(next, chapterNumber, bookCode);
      knownVersesRef.current = usjToPericopeVerses(usj);
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
        return update ? { ...verse, text: update.text, markers: update.markers } : verse;
      });
      onVersesChange(changed);
    },
    [onVersesChange]
  );

  const activeVerseRef = useRef<number | undefined>(undefined);
  /**
   * The editor's ScriptureReferencePlugin only mounts when `scrRef` is passed alongside
   * `onScrRefChange` — a callback alone is never called. Held as state so the pair forms the
   * controlled loop the editor expects (its plugin compares by value, so echoing the reported
   * ref back does not move the cursor).
   */
  const [scrRef, setScrRef] = useState<SerializedVerseRef>(() => ({
    book: bookCode ?? '',
    chapterNum: chapterNumber,
    verseNum: 1,
  }));

  const { restoreAfterLoad, cancelRestore } = useVerseCursorRestore(scrRef, setScrRef);

  useEffect(() => {
    activeVerseRef.current = undefined;
    cancelRestore();
    setScrRef({ book: bookCode ?? '', chapterNum: chapterNumber, verseNum: 1 });
  }, [bookCode, cancelRestore, chapterNumber, contentKey]);

  const handleScrRefChange = useCallback(
    (nextRef: SerializedVerseRef) => {
      setScrRef(nextRef);
      if (nextRef.verseNum > 0) {
        activeVerseRef.current = nextRef.verseNum;
        onActiveVerseChange?.(nextRef.verseNum);
      }
    },
    [onActiveVerseChange]
  );

  const handleStateChange = useCallback((snapshot: StateChangeSnapshot) => {
    setBlockMarker(snapshot.blockMarker);
  }, []);

  const handleFormat = useCallback(
    (marker: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      // A fresh chapter is one paragraph holding every verse, and the editor's own block
      // formatting restyles the whole block — one click would turn 31 verses into poetry (#427).
      // When the active verse's paragraph spans further than itself, the format is scoped to that
      // verse by rewriting the rows; the editor-native path stays for already-scoped blocks, where
      // it does the same thing and keeps the cursor.
      const activeVerse = activeVerseRef.current;
      const scoped =
        activeVerse === undefined
          ? null
          : scopeBlockFormatToVerse(knownVersesRef.current, activeVerse, marker);
      if (scoped && activeVerse !== undefined) {
        loadIntoEditor(scoped.updated);
        // Report what the document ended up holding, not the rows we handed it: the load
        // re-derives them, and the parent's copy has to be the one the next commit is diffed
        // against or an edit somewhere else would come back as a change to this verse.
        const loaded = knownVersesRef.current;
        onVersesChange(
          scoped.changed.map(
            row => loaded.find(verse => verse.verseNumber === row.verseNumber) ?? row
          )
        );
        // The load leaves the editor with no selection, and it only lands a task from now.
        restoreAfterLoad(activeVerse);
      } else {
        editor.formatPara(marker);
      }
      // The editor reports the new block through onStateChange, but only once it has committed;
      // reflecting it now keeps the bar from lagging a click behind. Only where there was a block
      // to act on, though: with no cursor `formatPara` has nothing to format, and a bar that
      // claimed otherwise would keep claiming it until the next selection change.
      setBlockMarker(current => (current === undefined ? current : marker));
    },
    [loadIntoEditor, onVersesChange, restoreAfterLoad]
  );

  return (
    <div className='chapter-editor flex h-full min-h-0 flex-col' data-testid='chapter-editor'>
      {!readOnly && <FormatBar blockMarker={blockMarker} onFormat={handleFormat} />}
      <div className='chapter-editor-surface rte-editor min-h-0 flex-1 overflow-y-auto px-6 py-4'>
        <Editorial
          ref={editorRef}
          defaultUsj={initialUsj}
          options={{
            isReadonly: readOnly,
            hasExternalUI: true,
            hasSpellCheck: false,
            textDirection: 'auto',
          }}
          scrRef={scrRef}
          onScrRefChange={handleScrRefChange}
          onStateChange={handleStateChange}
          onUsjChange={handleUsjChange}
        />
      </div>
    </div>
  );
}
