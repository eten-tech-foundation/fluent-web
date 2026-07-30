import { useCallback, useEffect, useRef, useState } from 'react';

import { applyTextEdits } from '../lib/text-edits';
import { snapshotStructure, verseRefAtRange } from '../lib/verse-map';
import { createLynxWorkspace } from '../lib/workspace';

import type { StructureSnapshot } from '../lib/verse-map';
import type { LynxContext } from '../lib/workspace';
import type { Diagnostic, DiagnosticFix, TextEdit } from '@sillsdev/lynx';
import type { UsfmDocument } from '@sillsdev/lynx-usfm';

export const POC_DOCUMENT_URI = 'fluent://poc/document.usfm';

export interface AnnotatedDiagnostic {
  /** Stable identity for React keys and app-side dismissal. */
  key: string;
  diagnostic: Diagnostic;
  verseRef?: string;
  startOffset: number;
  endOffset: number;
  fixes: Array<DiagnosticFix<TextEdit>>;
  dismissed: boolean;
}

export interface LynxDocumentState {
  status: 'initializing' | 'ready' | 'error';
  errorMessage?: string;
  usfm: string;
  diagnostics: AnnotatedDiagnostic[];
  structure?: StructureSnapshot;
  /** Characters that should trigger on-type formatting (e.g. straight quotes). */
  triggerCharacters: string[];
  /** Milliseconds Lynx took to re-parse + re-check the last change, client-side. */
  lastCheckMs?: number;
  /**
   * Load new source content. `contentLanguage` picks the rule set (#385):
   * pass it when the content's language is known ('en' enables the English
   * charset check); omit it for unknown languages, which disables charset
   * checking. Changing it rebuilds the workspace transparently.
   */
  loadSource: (usfm: string, contentLanguage?: string) => Promise<void>;
  /** `typedChar`/`caretOffset` enable on-type formatting (smart quotes). */
  changeUsfm: (next: string, typedChar?: string, caretOffset?: number) => Promise<void>;
  applyFix: (fix: DiagnosticFix<TextEdit>) => Promise<void>;
  dismiss: (key: string) => void;
  undismiss: (key: string) => void;
}

function diagnosticKey(diagnostic: Diagnostic, occurrence: number): string {
  const data = diagnostic.data as { verseRef?: string } | undefined;
  const anchor =
    data?.verseRef ?? `${diagnostic.range.start.line}:${diagnostic.range.start.character}`;
  return `${diagnostic.source}|${diagnostic.code}|${anchor}|${occurrence}`;
}

/**
 * Owns one Lynx workspace + one USFM document for the PoC page: pushes edits
 * into the DocumentManager, subscribes to diagnostics, and exposes everything
 * as plain React state.
 */
export function useLynxDocument(): LynxDocumentState {
  const ctxRef = useRef<LynxContext>();
  const contentLanguageRef = useRef<string>();
  const documentRef = useRef<UsfmDocument>();
  const generationRef = useRef(0);

  const [status, setStatus] = useState<LynxDocumentState['status']>('initializing');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [usfm, setUsfm] = useState('');
  const [diagnostics, setDiagnostics] = useState<AnnotatedDiagnostic[]>([]);
  const [structure, setStructure] = useState<StructureSnapshot>();
  const [triggerCharacters, setTriggerCharacters] = useState<string[]>([]);
  const [lastCheckMs, setLastCheckMs] = useState<number>();
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(new Set());
  const opened = useRef(false);

  const annotate = useCallback(async (raw: Diagnostic[], generation: number) => {
    const ctx = ctxRef.current;
    const document = documentRef.current;
    if (ctx == null || document == null) return;

    const occurrences = new Map<string, number>();
    const annotated = await Promise.all(
      raw.map(async diagnostic => {
        const base = `${diagnostic.source}|${diagnostic.code}`;
        const occurrence = occurrences.get(base) ?? 0;
        occurrences.set(base, occurrence + 1);
        const fixes = await ctx.workspace.getDiagnosticFixes(POC_DOCUMENT_URI, diagnostic);
        return {
          key: diagnosticKey(diagnostic, occurrence),
          diagnostic,
          verseRef: verseRefAtRange(document, diagnostic.range),
          startOffset: document.offsetAt(diagnostic.range.start),
          endOffset: document.offsetAt(diagnostic.range.end),
          fixes,
          dismissed: false,
        };
      })
    );

    if (generation === generationRef.current) {
      setDiagnostics(annotated);
    }
  }, []);

  const refresh = useCallback(
    async (content: string) => {
      const ctx = ctxRef.current;
      if (ctx == null) return;
      const generation = ++generationRef.current;

      const startedAt = performance.now();
      if (opened.current) {
        await ctx.changeDocument(POC_DOCUMENT_URI, content);
      } else {
        await ctx.openDocument(POC_DOCUMENT_URI, content);
        opened.current = true;
      }
      const document = await ctx.documentManager.get(POC_DOCUMENT_URI);
      documentRef.current = document ?? undefined;
      if (document != null) {
        setStructure(snapshotStructure(document));
      }

      const raw = await ctx.workspace.getDiagnostics(POC_DOCUMENT_URI);
      setLastCheckMs(performance.now() - startedAt);
      await annotate(raw, generation);
    },
    [annotate]
  );

  useEffect(() => {
    let cancelled = false;

    createLynxWorkspace()
      .then(ctx => {
        if (cancelled) return;
        ctxRef.current = ctx;
        setTriggerCharacters(ctx.workspace.getOnTypeTriggerCharacters());
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus('error');
      });

    return () => {
      cancelled = true;
      ctxRef.current?.closeDocument(POC_DOCUMENT_URI).catch(() => undefined);
    };
  }, []);

  const loadSource = useCallback(
    async (next: string, contentLanguage?: string) => {
      // A different content language means a different rule set: rebuild the
      // workspace before opening the document (#385).
      if (ctxRef.current != null && contentLanguageRef.current !== contentLanguage) {
        await ctxRef.current.closeDocument(POC_DOCUMENT_URI).catch(() => undefined);
        const ctx = await createLynxWorkspace({ contentLanguage });
        ctxRef.current = ctx;
        contentLanguageRef.current = contentLanguage;
        opened.current = false;
        setTriggerCharacters(ctx.workspace.getOnTypeTriggerCharacters());
      }
      setUsfm(next);
      setDismissedKeys(new Set());
      await refresh(next);
    },
    [refresh]
  );

  const changeUsfm = useCallback(
    async (next: string, typedChar?: string, caretOffset?: number) => {
      setUsfm(next);
      await refresh(next);

      const ctx = ctxRef.current;
      const document = documentRef.current;
      if (ctx == null || document == null) return;
      if (typedChar == null || caretOffset == null || !triggerCharacters.includes(typedChar))
        return;

      const position = document.positionAt(caretOffset);
      const edits = await ctx.workspace.getOnTypeEdits(POC_DOCUMENT_URI, position, typedChar);
      if (edits != null && edits.length > 0) {
        const corrected = applyTextEdits(document, edits);
        setUsfm(corrected);
        await refresh(corrected);
      }
    },
    [refresh, triggerCharacters]
  );

  const applyFix = useCallback(
    async (fix: DiagnosticFix<TextEdit>) => {
      const document = documentRef.current;
      if (document == null) return;
      const next = applyTextEdits(document, fix.edits);
      setUsfm(next);
      await refresh(next);
    },
    [refresh]
  );

  const dismiss = useCallback((key: string) => {
    setDismissedKeys(previous => new Set(previous).add(key));
  }, []);

  const undismiss = useCallback((key: string) => {
    setDismissedKeys(previous => {
      const next = new Set(previous);
      next.delete(key);
      return next;
    });
  }, []);

  return {
    status,
    errorMessage,
    usfm,
    diagnostics: diagnostics.map(d => ({ ...d, dismissed: dismissedKeys.has(d.key) })),
    structure,
    triggerCharacters,
    lastCheckMs,
    loadSource,
    changeUsfm,
    applyFix,
    dismiss,
    undismiss,
  };
}
