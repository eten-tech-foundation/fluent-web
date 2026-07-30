import { useCallback, useEffect, useRef, useState } from 'react';

import { Editorial } from '@eten-tech-foundation/platform-editor';

import '../styles/usj-nodes.css';
import '../styles/editor.css';
import '../styles/annotations.css';

import { FormatBar } from './FormatBar';

import type { RteAnnotation } from '../lib/lynx-annotations';
import type { AnnotationRange, EditorRef } from '@eten-tech-foundation/platform-editor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';

export interface RteEditorProps {
  /** The pericope slice to edit. Read again only when `usjKey` changes. */
  usj: Usj;
  /** Identity of the loaded slice; the editor reloads (setUsj) when it changes. */
  usjKey: string;
  annotations: RteAnnotation[];
  onUsjChange: (usj: Usj) => void;
  /** Current cursor position as "BOOK C:V" for display. */
  onScrRefChange?: (scrRef: string) => void;
  onAnnotationsApplied?: (ms: number, count: number) => void;
}

/** How long after the last editing keystroke before highlights re-apply. */
const TYPING_PAUSE_MS = 800;

function toAnnotationRange(annotation: RteAnnotation): AnnotationRange {
  return {
    start: annotation.selection.start,
    end: annotation.selection.end,
  } as AnnotationRange;
}

/**
 * Editorial (SharedEditor) wrapper. All editor-specific code lives here so the
 * ProseMirror counterpart swaps this component only (design.md, comparison
 * harness). The editor is uncontrolled: it owns the slice after load, the page
 * mirrors changes via onUsjChange.
 */
export function RteEditor({
  usj,
  usjKey,
  annotations,
  onUsjChange,
  onScrRefChange,
  onAnnotationsApplied,
}: RteEditorProps) {
  const editorRef = useRef<EditorRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadedKeyRef = useRef(usjKey);
  // JSON of the USJ we loaded programmatically, to swallow the editor's echo.
  const suppressedJsonRef = useRef(JSON.stringify(usj));
  const lastSeenJsonRef = useRef('');
  const appliedSignatureRef = useRef<string>('');
  const appliedRef = useRef(new Map<string, string>());
  const [barVisible, setBarVisible] = useState(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  /** Bumped on every distinct editor commit; re-arms the annotation pass. */
  const [contentEpoch, setContentEpoch] = useState(0);
  const [retryTick, setRetryTick] = useState(0);
  /** Highlights stay off until this timestamp while the user types. */
  const [pauseUntil, setPauseUntil] = useState(0);
  const pauseUntilRef = useRef(0);

  // Dev-only escape hatch for the PoC measurements (issue #375: CPU-throttled
  // annotation-apply timings are driven from the DevTools console).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__rteEditor = editorRef;
  }, []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__rteAnnotations = annotations;
  }, [annotations]);

  // Reload the editor content when the page switches pericope/chapter/source.
  useEffect(() => {
    if (loadedKeyRef.current === usjKey) return;
    loadedKeyRef.current = usjKey;
    suppressedJsonRef.current = JSON.stringify(usj);
    editorRef.current?.setUsj(usj);
    // Replacing the content drops existing marks; force a re-apply.
    appliedRef.current = new Map();
    appliedSignatureRef.current = '';
    setRetryTick(0);
  }, [usjKey, usj]);

  // Apply Lynx annotations as ephemeral typed marks (clear-and-reapply), but
  // ONLY when the annotation content changes or a verify pass found marks
  // missing — every apply lands in the editor's undo history (0.8.14 has no
  // history-exclusion for setAnnotation), so gratuitous re-applies would
  // pollute undo. Marks survive ordinary typing; they only vanish on content
  // replacement (setUsj) or when an apply raced Lexical's async first commit.
  // While the user is typing (pauseUntil in the future) applying is deferred —
  // see the keydown handler for why marks must be absent during typing.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor == null) return;
    const remaining = pauseUntil - Date.now();
    if (remaining > 0) {
      const timer = setTimeout(() => setPauseUntil(0), remaining);
      return () => clearTimeout(timer);
    }
    const signature = `${retryTick}|${JSON.stringify(annotations)}`;
    if (signature === appliedSignatureRef.current) return;
    appliedSignatureRef.current = signature;

    const started = performance.now();
    for (const [id, type] of appliedRef.current) {
      editor.removeAnnotation(type, id);
    }
    for (const annotation of annotations) {
      editor.setAnnotation(toAnnotationRange(annotation), annotation.type, annotation.id);
    }
    appliedRef.current = new Map(annotations.map(a => [a.id, a.type]));
    onAnnotationsApplied?.(performance.now() - started, annotations.length);
  }, [annotations, retryTick, pauseUntil, onAnnotationsApplied]);

  // Verification: after each apply and each editor commit, check that marks
  // exist in the DOM at all; if none landed, bump retryTick (bounded) to
  // re-apply. This heals the initial-load race and setUsj reloads. It
  // deliberately does NOT compare counts — adjacent marks merge in the DOM,
  // and count-triggered re-apply cycles are what amplified the upstream
  // text-corruption bug.
  useEffect(() => {
    if (annotations.length === 0 || retryTick >= 3) return;
    const verify = setTimeout(() => {
      if (Date.now() < pauseUntil) return;
      const landed = containerRef.current?.querySelectorAll("mark[class*='annotationId-']");
      if ((landed?.length ?? 0) === 0) setRetryTick(previous => previous + 1);
    }, 150);
    return () => clearTimeout(verify);
  }, [annotations, contentEpoch, retryTick, pauseUntil]);

  // KEY FINDING (platform-editor 0.8.14): typing while external TypedMark
  // annotations are present corrupts the document — spaces materialize at mark
  // boundaries (repro: 3 chars typed → +10 text length) and flow into
  // onUsjChange/getUsj, i.e. into anything saved. Static apply/remove is clean.
  // Mitigation: strip all marks on the first editing keystroke (keydown runs
  // before Lexical processes the input) and re-apply after an idle pause.
  const clearMarksForTyping = useCallback(() => {
    const editor = editorRef.current;
    if (editor == null) return;
    if (appliedRef.current.size > 0) {
      for (const [id, type] of appliedRef.current) {
        editor.removeAnnotation(type, id);
      }
      appliedRef.current = new Map();
      appliedSignatureRef.current = '';
      setRetryTick(0);
    }
    if (Date.now() + TYPING_PAUSE_MS - pauseUntilRef.current > 250) {
      pauseUntilRef.current = Date.now() + TYPING_PAUSE_MS;
      setPauseUntil(pauseUntilRef.current);
    }
  }, []);

  const handleUsjChange = useCallback(
    (next: Usj) => {
      const json = JSON.stringify(next);
      // Every distinct commit re-arms the annotation pass; identical emissions
      // (e.g. triggered by mark insertion) don't, which prevents loops.
      if (json === lastSeenJsonRef.current) return;
      lastSeenJsonRef.current = json;
      setContentEpoch(previous => previous + 1);
      if (json === suppressedJsonRef.current) return;
      onUsjChange(next);
    },
    [onUsjChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        setBarVisible(previous => !previous);
        return;
      }
      if (event.key === 'Escape') {
        setBarVisible(false);
        return;
      }
      const isEditingKey =
        (event.key.length === 1 && !event.ctrlKey && !event.metaKey) ||
        ['Backspace', 'Delete', 'Enter'].includes(event.key);
      if (isEditingKey) clearMarksForTyping();
    },
    [clearMarksForTyping]
  );

  return (
    <div
      ref={containerRef}
      className='rte-editor relative rounded-md border'
      onKeyDown={handleKeyDown}
    >
      <FormatBar
        canRedo={history.canRedo}
        canUndo={history.canUndo}
        visible={barVisible}
        onFormatPara={marker => editorRef.current?.formatPara(marker)}
        onRedo={() => editorRef.current?.redo()}
        onUndo={() => editorRef.current?.undo()}
      />
      <div className='max-h-[32rem] min-h-[16rem] overflow-y-auto p-4'>
        <Editorial
          ref={editorRef}
          defaultUsj={usj}
          options={{ hasExternalUI: true, hasSpellCheck: false, textDirection: 'auto' }}
          onScrRefChange={scrRef =>
            onScrRefChange?.(`${scrRef.book} ${scrRef.chapterNum}:${scrRef.verseNum}`)
          }
          onStateChange={({ canUndo, canRedo }) => setHistory({ canUndo, canRedo })}
          onUsjChange={handleUsjChange}
        />
      </div>
      <div className='text-muted-foreground border-t px-3 py-1.5 text-xs'>
        Ctrl+/ toggles the format bar · no permanent toolbar by design
      </div>
    </div>
  );
}
