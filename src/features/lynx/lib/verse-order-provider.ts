/**
 * Vendored from sillsdev/lynx `packages/examples/src/verse-order-diagnostic-provider.ts`
 * (MIT), because @sillsdev/lynx-examples is not published to npm. Adapted to the
 * published @sillsdev/lynx 0.3.5 API: `getDiagnosticFixes` instead of the
 * unreleased `getDiagnosticActions`, no command actions, no fingerprint field,
 * and locale namespaces registered from statically imported JSON (Vite-safe).
 *
 * In the real integration this file is the template for Fluent-owned providers
 * (e.g. a Greek Room provider that calls the fluent-api AI proxy).
 */

import {
  activeDiagnosticsChanged$,
  DiagnosticSeverity,
  ScriptureBook,
  ScriptureChapter,
  ScriptureNodeType,
  ScriptureVerse,
} from '@sillsdev/lynx';

import verseOrderEn from './locales/verse-order.en.json';
import verseOrderEs from './locales/verse-order.es.json';

import type {
  Diagnostic,
  DiagnosticFix,
  DiagnosticProvider,
  DocumentAccessor,
  Localizer,
  ScriptureDocument,
  ScriptureEditFactory,
  TextEdit,
} from '@sillsdev/lynx';

const LOCALES: Record<string, unknown> = {
  en: verseOrderEn,
  es: verseOrderEs,
};

interface DiagnosticData {
  missingVerse: number;
  verseRef: string;
}

export class VerseOrderDiagnosticProvider<T = TextEdit> implements DiagnosticProvider<T> {
  public readonly id = 'verse-order';
  // Typed via the provider interface so the PoC doesn't need rxjs as a direct dependency.
  public readonly diagnosticsChanged$: DiagnosticProvider<T>['diagnosticsChanged$'];

  constructor(
    private readonly localizer: Localizer,
    private readonly documents: DocumentAccessor<ScriptureDocument>,
    private readonly editFactory: ScriptureEditFactory<ScriptureDocument, T>
  ) {
    this.diagnosticsChanged$ = activeDiagnosticsChanged$(documents, doc =>
      this.validateDocument(doc)
    );
  }

  init(): Promise<void> {
    this.localizer.addNamespace(
      'verseOrder',
      (language: string) => LOCALES[language] ?? verseOrderEn
    );
    return Promise.resolve();
  }

  async getDiagnostics(uri: string): Promise<Diagnostic[]> {
    const doc = await this.documents.get(uri);
    if (doc == null) {
      return [];
    }
    return this.validateDocument(doc);
  }

  async getDiagnosticFixes(uri: string, diagnostic: Diagnostic): Promise<Array<DiagnosticFix<T>>> {
    const doc = await this.documents.get(uri);
    if (doc == null) {
      return [];
    }
    const fixes: Array<DiagnosticFix<T>> = [];
    if (diagnostic.code === 2) {
      const { missingVerse } = diagnostic.data as DiagnosticData;
      fixes.push({
        title: this.localizer.t('missingVerse.fixTitle', { ns: 'verseOrder' }),
        isPreferred: true,
        diagnostic,
        edits: this.editFactory.createScriptureEdit(
          doc,
          { start: diagnostic.range.start, end: diagnostic.range.start },
          new ScriptureVerse(missingVerse.toString())
        ),
      });
    }
    return fixes;
  }

  private validateDocument(doc: ScriptureDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    const verseNodes: Array<[number, ScriptureVerse]> = [];
    let chapterNumber = '0';
    let bookId = '';
    for (const node of doc.findNodes([
      ScriptureNodeType.Book,
      ScriptureNodeType.Chapter,
      ScriptureNodeType.Verse,
    ])) {
      if (node instanceof ScriptureChapter) {
        diagnostics.push(...this.findMissingVerses(chapterNumber, verseNodes));
        chapterNumber = node.number;
        verseNodes.length = 0;
      } else if (node instanceof ScriptureBook) {
        bookId = node.code;
      } else if (node instanceof ScriptureVerse) {
        const verseNumber = parseInt(node.number);
        if (!isNaN(verseNumber)) {
          if (verseNodes.length > 0) {
            const [prevVerseNumber, prevVerseNode] = verseNodes[verseNodes.length - 1];
            if (verseNumber <= prevVerseNumber) {
              diagnostics.push({
                range: prevVerseNode.range,
                severity: DiagnosticSeverity.Error,
                code: 1,
                message: this.localizer.t('verseOutOfOrder.description', {
                  ns: 'verseOrder',
                  chapter: chapterNumber,
                  verse: prevVerseNumber.toString(),
                }),
                moreInfo: this.localizer.t('verseOutOfOrder.moreInfo', { ns: 'verseOrder' }),
                source: this.id,
                data: { verseRef: `${bookId} ${chapterNumber}:${prevVerseNumber.toString()}` },
              });
            }
          }
          verseNodes.push([verseNumber, node]);
        }
      }
    }

    diagnostics.push(...this.findMissingVerses(chapterNumber, verseNodes));
    return diagnostics;
  }

  private findMissingVerses(
    chapterNumber: string,
    verseNodes: Array<[number, ScriptureVerse]>
  ): Diagnostic[] {
    const sorted = [...verseNodes].sort((a, b) => a[0] - b[0]);
    const diagnostics: Diagnostic[] = [];
    for (const [i, [number, node]] of sorted.entries()) {
      if (number !== i + 1) {
        const missingVerse = number - 1;
        diagnostics.push({
          range: node.range,
          severity: DiagnosticSeverity.Warning,
          code: 2,
          message: this.localizer.t('missingVerse.description', {
            ns: 'verseOrder',
            chapter: chapterNumber,
            verse: missingVerse.toString(),
          }),
          moreInfo: this.localizer.t('missingVerse.moreInfo', { ns: 'verseOrder' }),
          source: this.id,
          data: {
            missingVerse,
            verseRef: `${chapterNumber}:${missingVerse.toString()}`,
          } satisfies DiagnosticData & { verseRef: string },
        });
      }
    }
    return diagnostics;
  }
}
