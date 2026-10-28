import { useCallback, useEffect, useRef, useState } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';

import { useForwardTextDeletion } from '../hooks/useForwardTextDeletion';
import { useHeadingEnter } from '../hooks/useHeadingEnter';
import { useNativeRtlSelection } from '../hooks/useNativeRtlSelection';
import { useProtectedVerseMarkers } from '../hooks/useProtectedVerseMarkers';
import { useVerseNumberCaret } from '../hooks/useVerseNumberCaret';
import { useVerseNumberKeys } from '../hooks/useVerseNumberKeys';
import { handleEditorContextMenu, handleEditorPaste } from '../lib/editor-clipboard';
import { EDITABLE_EDITOR_SELECTOR } from '../lib/editor-dom';
import { useEditorShortcuts } from '../lib/editor-shortcuts';
import { headingErrorIn, type HeadingError } from '../lib/heading-markers';
import {
  changedVerses,
  continuedParagraphOf,
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '../lib/pericope-usj';
import { placeCaretAtVerseEnd, verseAtCaret, type VerseCaretRequest } from '../lib/verse-caret';

import { HeadingValidationMessage } from './HeadingValidationMessage';

import '../styles/usj-nodes.css';
import '../styles/fonts.css';
import '../styles/editor.css';
import '../styles/editor-shared.css';
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
  /** Heading slots held by content edited outside this surface, keyed by verse number. */
  reservedHeadingSlots?: Record<number, number>;
  /**
   * The paragraph the chapter has open where this pericope starts (`paragraphOpenBefore`). A first
   * verse that doesn't open a paragraph of its own continues it, and editing that verse doesn't
   * save it as a new paragraph (#530).
   */
  continuedParagraph?: string;
  /** Called with only the verses whose text or paragraph markers changed. */
  onVersesChange: (changed: PericopeVerseText[]) => void;
  /** The verse the cursor is in, for the drafting surface's active-verse tracking. */
  onActiveVerseChange?: (verseNumber: number) => void;
  /**
   * Called after every click in the editor with the verse the caret is in, or undefined when it
   * isn't in a verse (a heading, say). `onActiveVerseChange` only reports a move to another verse
   * inside this editor, so a click back into a pericope box at the same verse says nothing (#479).
   */
  onVerseClick?: (verseNumber: number | undefined) => void;
  /**
   * Focuses the editor with the caret at the end of this verse, when the verse is in this
   * pericope. Next Pericope asks for it (#479).
   */
  caretRequest?: VerseCaretRequest | null;
}

/**
 * Rich text editing for one pericope, replacing the per-verse textareas (#314).
 *
 * The editor is **uncontrolled**: it owns the document once loaded, and this component mirrors
 * edits back out as verse rows. Feeding every keystroke back in as a new `usj` prop would fight
 * the editor for the cursor, so it is written back into only in three cases: `contentKey`
 * changed, the parent filled a verse the editor holds empty (the AI suggestion path), or the
 * paragraph a continuing first verse sits in changed in the pericope before.
 *
 * Paragraph breaks the translator creates survive the trip out: `usjToPericopeVerses` derives a
 * `{marker, offset}` entry per paragraph, stored beside the verse (fluent-api#264), and stored
 * markers are rebuilt into the document on load.
 */
export function PericopeEditor({
  verses,
  chapterNumber,
  bookCode,
  readOnly = false,
  contentKey,
  reservedHeadingSlots,
  continuedParagraph,
  onVersesChange,
  onActiveVerseChange,
  onVerseClick,
  caretRequest,
}: PericopeEditorProps) {
  const editorRef = useRef<EditorRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Marker protection must register first so a blocked deletion never reaches the forward-delete fix.
  useProtectedVerseMarkers(containerRef);
  useNativeRtlSelection(containerRef, readOnly);
  useForwardTextDeletion(containerRef, editorRef, readOnly);
  useVerseNumberCaret(containerRef, readOnly);
  const [headingError, setHeadingError] = useState<HeadingError>(null);
  const loadedKeyRef = useRef(contentKey);
  /** The `continuedParagraph` the loaded document was built with. */
  const loadedOpenRef = useRef(continuedParagraph);
  /**
   * The paragraph the loaded document's first verse continues, if it opens none of its own, so
   * commits are read the way it was built.
   */
  const continuedRef = useRef(continuedParagraphOf(verses, continuedParagraph));
  /**
   * What the editor's own document holds, to diff each commit against — kept in *document space*
   * (the rows re-derived from the document we built), never the raw props. The document makes a
   * legacy verse's opening paragraph explicit, so diffing raw rows against a derived commit would
   * report that upgrade as an edit on every mount.
   */
  const knownVersesRef = useRef<PericopeVerseText[]>(
    usjToPericopeVerses(
      pericopeVersesToUsj(verses, chapterNumber, bookCode, continuedParagraph),
      continuedRef.current
    )
  );
  /** USJ we pushed in ourselves; the editor echoes it straight back and that is not an edit. */
  const suppressedJsonRef = useRef('');
  /** A rebuild waiting for the translator to leave this box. */
  const pendingRebuildRef = useRef(false);

  const loadIntoEditor = useCallback(
    (next: PericopeVerseText[]) => {
      setHeadingError(null);
      pendingRebuildRef.current = false;
      loadedOpenRef.current = continuedParagraph;
      continuedRef.current = continuedParagraphOf(next, continuedParagraph);
      const usj = pericopeVersesToUsj(next, chapterNumber, bookCode, continuedParagraph);
      knownVersesRef.current = usjToPericopeVerses(usj, continuedRef.current);
      suppressedJsonRef.current = JSON.stringify(usj);
      editorRef.current?.setUsj(usj);
    },
    [bookCode, chapterNumber, continuedParagraph]
  );

  // Text the parent wrote that the editor never held: the drafting surface fills an empty verse
  // with its AI suggestion. It has to reach the document, or the translator never sees it and the
  // next commit reports the verse as emptied and writes the suggestion away. Verses the editor
  // already has text in are left alone, since that text is what the translator is looking at.
  useEffect(() => {
    if (contentKey !== loadedKeyRef.current || headingError) return;

    const known = knownVersesRef.current;
    const merged = known.map(verse => {
      if (verse.text !== '') return verse;
      const incoming = verses.find(candidate => candidate.verseNumber === verse.verseNumber);
      return incoming && incoming.text !== '' ? { ...verse, text: incoming.text } : verse;
    });

    // Untouched entries come back by reference, so identity is the whole test.
    if (merged.some((verse, index) => verse !== known[index])) loadIntoEditor(merged);
  }, [contentKey, headingError, loadIntoEditor, verses]);

  useEffect(() => {
    if (contentKey === loadedKeyRef.current) return;
    loadedKeyRef.current = contentKey;
    loadIntoEditor(verses);
  }, [contentKey, loadIntoEditor, verses]);

  // The pericope before changed the paragraph it leaves open (its last two lines joined into a
  // Poetry line, say) while this one stayed open. A first verse that continues that paragraph
  // follows it, as Chapter View shows it, and its next save is read against it. A rebuild resets
  // the caret and the undo history, so if a row update from outside lands while the translator is
  // in this box, it waits until they leave it; edits meanwhile are read the way the box was built.
  useEffect(() => {
    if (contentKey !== loadedKeyRef.current || continuedParagraph === loadedOpenRef.current) return;
    loadedOpenRef.current = continuedParagraph;
    if (continuedRef.current === undefined) return;
    if (containerRef.current?.contains(document.activeElement)) pendingRebuildRef.current = true;
    else loadIntoEditor(knownVersesRef.current);
  }, [contentKey, continuedParagraph, loadIntoEditor]);

  const handleBlur = useCallback(() => {
    if (!pendingRebuildRef.current) return;
    // Let focus settle: a move within the box, or the window losing focus, isn't leaving it.
    setTimeout(() => {
      if (!pendingRebuildRef.current || containerRef.current?.contains(document.activeElement))
        return;
      loadIntoEditor(knownVersesRef.current);
    });
  }, [loadIntoEditor]);

  // A request already there when this editor mounted was for an earlier one, e.g. before a view
  // switch. Every editor gets the request; the one holding the verse takes the caret.
  const answeredCaretRef = useRef(caretRequest);
  useEffect(() => {
    if (readOnly || !caretRequest || caretRequest === answeredCaretRef.current) return;
    answeredCaretRef.current = caretRequest;
    const root = containerRef.current?.querySelector<HTMLElement>(EDITABLE_EDITOR_SELECTOR);
    if (root) placeCaretAtVerseEnd(root, caretRequest.verseNumber);
  }, [caretRequest, readOnly]);

  const handleUsjChange = useCallback(
    (usj: Usj) => {
      const json = JSON.stringify(usj);
      if (json === suppressedJsonRef.current) return;
      suppressedJsonRef.current = json;

      const derived = usjToPericopeVerses(usj, continuedRef.current);
      const error = headingErrorIn(
        derived.map(verse => ({
          ...verse,
          reservedHeadingSlots: reservedHeadingSlots?.[verse.verseNumber],
        }))
      );
      setHeadingError(error);
      if (error) return;
      const changed = changedVerses(knownVersesRef.current, derived);
      if (changed.length === 0) return;

      knownVersesRef.current = knownVersesRef.current.map(verse => {
        const update = changed.find(c => c.verseNumber === verse.verseNumber);
        return update ? { ...verse, text: update.text, markers: update.markers } : verse;
      });
      onVersesChange(changed);
    },
    [onVersesChange, reservedHeadingSlots]
  );

  const handleScrRefChange = useCallback(
    (scrRef: SerializedVerseRef) => {
      if (scrRef.verseNum > 0) onActiveVerseChange?.(scrRef.verseNum);
    },
    [onActiveVerseChange]
  );

  // React handles the click after useVerseNumberCaret has moved the caret, so this reads where the
  // translator's click finally put it.
  const handleClick = useCallback(() => {
    if (!onVerseClick) return;
    const root = containerRef.current?.querySelector<HTMLElement>(EDITABLE_EDITOR_SELECTOR);
    onVerseClick(root ? verseAtCaret(root, document.getSelection()) : undefined);
  }, [onVerseClick]);

  const handleEditorKeys = useEditorShortcuts(editorRef);
  const handleHeadingEnter = useHeadingEnter(editorRef, readOnly);
  const verseKeys = useVerseNumberKeys(editorRef, readOnly);

  return (
    <div
      ref={containerRef}
      className='pericope-editor rte-editor'
      data-testid='pericope-editor'
      onBlurCapture={handleBlur}
      onClick={handleClick}
      onContextMenuCapture={handleEditorContextMenu}
      onKeyDownCapture={event => {
        if (!handleHeadingEnter(event) && !verseKeys.handleKeyDown(event)) handleEditorKeys(event);
      }}
      onPasteCapture={event => {
        if (!verseKeys.handlePaste(event)) handleEditorPaste(event);
      }}
    >
      <HeadingValidationMessage error={headingError} />
      <Editorial
        ref={editorRef}
        defaultUsj={pericopeVersesToUsj(verses, chapterNumber, bookCode, continuedParagraph)}
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
