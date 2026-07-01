import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';

import { DiagnosticSeverity } from '@sillsdev/lynx';

import type { AnnotatedDiagnostic } from '../hooks/useLynxDocument';

export interface UsfmEditorHandle {
  /** Selects and reveals a text range (used by the checks panel). */
  select: (startOffset: number, endOffset: number) => void;
}

interface UsfmEditorProps {
  value: string;
  diagnostics: AnnotatedDiagnostic[];
  onChangeValue: (next: string, typedChar?: string, caretOffset?: number) => void;
}

const SEVERITY_MARK_CLASS: Record<number, string> = {
  [DiagnosticSeverity.Error]: 'bg-red-500/15 underline decoration-red-500 decoration-wavy',
  [DiagnosticSeverity.Warning]: 'bg-amber-500/20 underline decoration-amber-500 decoration-wavy',
  [DiagnosticSeverity.Information]: 'bg-sky-500/15 underline decoration-sky-500 decoration-dotted',
  [DiagnosticSeverity.Hint]: 'bg-sky-500/10 underline decoration-sky-400 decoration-dotted',
};

interface HighlightSegment {
  start: number;
  end: number;
  severity?: DiagnosticSeverity;
}

function buildSegments(value: string, diagnostics: AnnotatedDiagnostic[]): HighlightSegment[] {
  const active = diagnostics
    .filter(d => !d.dismissed && d.endOffset > d.startOffset && d.endOffset <= value.length)
    .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const d of active) {
    const start = Math.max(d.startOffset, cursor);
    if (start >= d.endOffset) continue; // fully covered by a previous mark
    if (start > cursor) {
      segments.push({ start: cursor, end: start });
    }
    segments.push({ start, end: d.endOffset, severity: d.diagnostic.severity });
    cursor = d.endOffset;
  }
  if (cursor < value.length) {
    segments.push({ start: cursor, end: value.length });
  }
  return segments;
}

// A classic "highlighted textarea": a mirror <pre> renders the same text behind
// a transparent-background <textarea>; only the mirror shows tints/underlines.
export const UsfmEditor = forwardRef<UsfmEditorHandle, UsfmEditorProps>(function UsfmEditor(
  { value, diagnostics, onChangeValue },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLPreElement>(null);
  const caretRef = useRef<number | null>(null);

  // Async edits (smart quotes, quick fixes) replace the controlled value from
  // outside; restore the caret so typing isn't interrupted.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea != null && caretRef.current != null && document.activeElement === textarea) {
      const caret = Math.min(caretRef.current, value.length);
      textarea.setSelectionRange(caret, caret);
    }
  }, [value]);

  useImperativeHandle(ref, () => ({
    select: (startOffset: number, endOffset: number) => {
      const textarea = textareaRef.current;
      if (textarea == null) return;
      textarea.focus();
      textarea.setSelectionRange(startOffset, endOffset);
      // Rough scroll-to-selection: jump to the line's proportional position.
      const linesBefore = value.slice(0, startOffset).split('\n').length - 1;
      const totalLines = value.split('\n').length;
      textarea.scrollTop = (linesBefore / Math.max(totalLines, 1)) * textarea.scrollHeight - 60;
    },
  }));

  const segments = useMemo(() => buildSegments(value, diagnostics), [value, diagnostics]);

  const sharedTextClasses = 'font-mono text-sm leading-6 whitespace-pre-wrap break-words';

  return (
    <div className='relative overflow-hidden rounded-lg border-2'>
      <pre
        ref={mirrorRef}
        aria-hidden='true'
        className={`${sharedTextClasses} pointer-events-none absolute inset-0 m-0 overflow-hidden p-4 text-transparent`}
      >
        {segments.map(segment => {
          const text = value.slice(segment.start, segment.end);
          return segment.severity != null ? (
            <mark
              key={`${segment.start}-${segment.end}`}
              className={`${SEVERITY_MARK_CLASS[segment.severity]} rounded-xs text-transparent underline-offset-4`}
            >
              {text}
            </mark>
          ) : (
            <span key={`${segment.start}-${segment.end}`}>{text}</span>
          );
        })}
        {'\n'}
      </pre>
      <textarea
        ref={textareaRef}
        aria-label='USFM source'
        className={`${sharedTextClasses} text-foreground caret-foreground relative block h-[32rem] w-full resize-none bg-transparent p-4 outline-none`}
        spellCheck={false}
        value={value}
        onChange={event => {
          const typedChar = (event.nativeEvent as InputEvent).data ?? undefined;
          caretRef.current = event.target.selectionStart;
          onChangeValue(event.target.value, typedChar ?? undefined, event.target.selectionStart);
        }}
        onScroll={event => {
          const mirror = mirrorRef.current;
          if (mirror != null) {
            mirror.scrollTop = event.currentTarget.scrollTop;
            mirror.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
      />
    </div>
  );
});
