import { useCallback, useEffect, useRef, useState } from 'react';

import { baseKeymap } from 'prosemirror-commands';
import { history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';

import '../styles/pm-editor.css';

import { annotationRanges, docToUsj, usjToDoc } from '../lib/pm-doc';

import { FormatBar } from './FormatBar';

import type { RteEditorProps } from './RteEditor';
import type { Usj } from '@eten-tech-foundation/scripture-utilities';
import type { Transaction } from 'prosemirror-state';

const decoKey = new PluginKey<DecorationSet>('rteLynxDecorations');
const decoPlugin = new Plugin<DecorationSet>({
  key: decoKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      const next = tr.getMeta(decoKey) as DecorationSet | undefined;
      if (next !== undefined) return next;
      return set.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return decoKey.getState(state);
    },
  },
});

function buildState(usj: Usj): EditorState {
  return EditorState.create({
    doc: usjToDoc(usj).doc,
    plugins: [
      history(),
      keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo }),
      keymap(baseKeymap),
      decoPlugin,
    ],
  });
}

/**
 * The ProseMirror counterpart behind the same interface as RteEditor
 * (design.md comparison harness): same slice in, same USJ out, same
 * annotations, same on-demand format bar. Decorations are ephemeral view
 * state — they never touch the document or the undo history.
 */
export function PmEditor({
  usj,
  usjKey,
  annotations,
  onUsjChange,
  onScrRefChange,
  onAnnotationsApplied,
}: RteEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const templateRef = useRef(usj);
  const loadedKeyRef = useRef<string>('');
  const suppressedJsonRef = useRef('');
  const appliedSignatureRef = useRef('');
  const [barVisible, setBarVisible] = useState(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const usjRef = useRef(usj);
  usjRef.current = usj;
  const onUsjChangeRef = useRef(onUsjChange);
  onUsjChangeRef.current = onUsjChange;
  const onScrRefChangeRef = useRef(onScrRefChange);
  onScrRefChangeRef.current = onScrRefChange;

  const reportScrRef = useCallback((state: EditorState) => {
    const template = templateRef.current;
    const book = template.content.find(n => typeof n !== 'string' && n.type === 'book');
    const chapter = template.content.find(n => typeof n !== 'string' && n.type === 'chapter');
    let verse: string | undefined;
    state.doc.nodesBetween(0, state.selection.from, node => {
      if (node.type.name === 'verse') verse = node.attrs.number as string;
      return true;
    });
    if (verse != null && book != null && chapter != null && typeof book !== 'string') {
      const bookCode = (book as { code?: string }).code ?? '';
      const chapterNumber = (chapter as { number?: string }).number ?? '';
      onScrRefChangeRef.current?.(`${bookCode} ${chapterNumber}:${verse}`);
    }
  }, []);

  // Create the view once; reload state when usjKey changes.
  useEffect(() => {
    if (hostRef.current == null) return;
    if (viewRef.current == null) {
      const view = new EditorView(hostRef.current, {
        state: buildState(usjRef.current),
        dispatchTransaction: (tr: Transaction) => {
          const next = view.state.apply(tr);
          view.updateState(next);
          setHistoryState({ canUndo: undoDepth(next) > 0, canRedo: redoDepth(next) > 0 });
          reportScrRef(next);
          if (!tr.docChanged) return;
          const serialized = docToUsj(next.doc, templateRef.current);
          const json = JSON.stringify(serialized);
          if (json === suppressedJsonRef.current) return;
          onUsjChangeRef.current(serialized);
        },
      });
      viewRef.current = view;
      templateRef.current = usjRef.current;
      suppressedJsonRef.current = JSON.stringify(usjRef.current);
      loadedKeyRef.current = usjKey;
      // A fresh view has no decorations — re-arm the annotation pass (matters
      // under StrictMode's dev double-mount, where refs survive the remount).
      appliedSignatureRef.current = '';
      return;
    }
    if (loadedKeyRef.current === usjKey) return;
    loadedKeyRef.current = usjKey;
    templateRef.current = usjRef.current;
    suppressedJsonRef.current = JSON.stringify(usjRef.current);
    appliedSignatureRef.current = '';
    viewRef.current.updateState(buildState(usjRef.current));
    setHistoryState({ canUndo: false, canRedo: false });
  }, [usjKey, reportScrRef]);

  useEffect(
    () => () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    },
    []
  );

  // Apply annotations as decorations — one transaction, no history impact.
  useEffect(() => {
    const view = viewRef.current;
    if (view == null) return;
    const signature = JSON.stringify(annotations);
    if (signature === appliedSignatureRef.current) return;
    appliedSignatureRef.current = signature;

    const started = performance.now();
    try {
      const { textPositions } = usjToDoc(usj);
      const ranges = annotationRanges(annotations, textPositions);
      const decorations = ranges.map(r =>
        Decoration.inline(r.from, r.to, { class: `pm-lynx-${r.type}` })
      );
      const set = DecorationSet.create(view.state.doc, decorations);
      view.dispatch(view.state.tr.setMeta(decoKey, set));
      onAnnotationsApplied?.(performance.now() - started, ranges.length);
    } catch {
      // Positions can be transiently out of range mid merge-cycle; the next
      // diagnostics pass re-applies cleanly.
      appliedSignatureRef.current = '';
    }
  }, [annotations, usj, onAnnotationsApplied]);

  const formatPara = useCallback((marker: string) => {
    const view = viewRef.current;
    if (view == null) return;
    const { $from } = view.state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name === 'para') {
        const pos = $from.before(depth);
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, marker }));
        view.focus();
        return;
      }
    }
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === '/') {
      event.preventDefault();
      setBarVisible(previous => !previous);
    } else if (event.key === 'Escape') {
      setBarVisible(false);
    }
  }, []);

  return (
    <div className='pm-editor relative rounded-md border' onKeyDown={handleKeyDown}>
      <FormatBar
        canRedo={historyState.canRedo}
        canUndo={historyState.canUndo}
        visible={barVisible}
        onFormatPara={formatPara}
        onRedo={() => {
          const view = viewRef.current;
          if (view) redo(view.state, view.dispatch);
        }}
        onUndo={() => {
          const view = viewRef.current;
          if (view) undo(view.state, view.dispatch);
        }}
      />
      <div className='max-h-[32rem] min-h-[16rem] overflow-y-auto bg-white p-4'>
        <div ref={hostRef} />
      </div>
      <div className='text-muted-foreground border-t px-3 py-1.5 text-xs'>
        ProseMirror counterpart · Ctrl+/ toggles the format bar
      </div>
    </div>
  );
}
