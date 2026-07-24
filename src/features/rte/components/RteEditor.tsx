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
  const loadedKeyRef = useRef(usjKey);
  // JSON of the USJ we loaded programmatically, to swallow the editor's echo.
  const suppressedJsonRef = useRef(JSON.stringify(usj));
  const appliedSignatureRef = useRef<string>('');
  const appliedRef = useRef(new Map<string, string>());
  const [barVisible, setBarVisible] = useState(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });

  // Reload the editor content when the page switches pericope/chapter/source.
  useEffect(() => {
    if (loadedKeyRef.current === usjKey) return;
    loadedKeyRef.current = usjKey;
    suppressedJsonRef.current = JSON.stringify(usj);
    editorRef.current?.setUsj(usj);
    // Replacing the content drops existing marks; force a re-apply.
    appliedRef.current = new Map();
    appliedSignatureRef.current = '';
  }, [usjKey, usj]);

  // Apply Lynx annotations as ephemeral typed marks (clear-and-reapply).
  useEffect(() => {
    const editor = editorRef.current;
    if (editor == null) return;
    const signature = JSON.stringify(annotations);
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
  }, [annotations, onAnnotationsApplied]);

  const handleUsjChange = useCallback(
    (next: Usj) => {
      if (JSON.stringify(next) === suppressedJsonRef.current) return;
      onUsjChange(next);
    },
    [onUsjChange]
  );

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === '/') {
      event.preventDefault();
      setBarVisible(previous => !previous);
    } else if (event.key === 'Escape') {
      setBarVisible(false);
    }
  }, []);

  return (
    <div className='rte-editor relative rounded-md border' onKeyDown={handleKeyDown}>
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
