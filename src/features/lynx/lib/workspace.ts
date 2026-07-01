import { DocumentManager, Localizer, Workspace } from '@sillsdev/lynx';
import { StandardRuleSets } from '@sillsdev/lynx-punctuation-checker';
import { UsfmDocumentFactory, UsfmEditFactory } from '@sillsdev/lynx-usfm';

import allowedCharactersEn from './locales/allowed-characters.en.json';
import pairedPunctuationEn from './locales/paired-punctuation.en.json';
import punctuationContextEn from './locales/punctuation-context.en.json';
import quotationEn from './locales/quotation.en.json';
import standardFixesEn from './locales/standard-fixes.en.json';
import { createBrowserUsfmStylesheet } from './stylesheet';
import { VerseOrderDiagnosticProvider } from './verse-order-provider';

import type { TextEdit } from '@sillsdev/lynx';
import type { UsfmDocument } from '@sillsdev/lynx-usfm';

/**
 * The punctuation-checker package loads its locale JSONs with template-literal
 * dynamic imports, which Vite's dependency optimizer cannot rewrite — at
 * runtime the messages fall back to raw i18next keys. `Localizer.addNamespace`
 * is first-write-wins, so registering the same namespaces here with statically
 * imported JSON (vendored from the package's dist, MIT) takes precedence.
 * Upstream ask (sillsdev/lynx): ship locales in a bundler-friendly way.
 */
function registerBundlerSafeLocales(localizer: Localizer): void {
  const namespaces: Array<[string, unknown]> = [
    ['quotation', quotationEn],
    ['allowedCharacters', allowedCharactersEn],
    ['pairedPunctuation', pairedPunctuationEn],
    ['punctuation-context', punctuationContextEn],
    ['standardPunctuationFixes', standardFixesEn],
  ];
  for (const [namespace, resources] of namespaces) {
    localizer.addNamespace(namespace, () => resources);
  }
}

export interface LynxContext {
  workspace: Workspace<TextEdit>;
  documentManager: DocumentManager<UsfmDocument>;
  editFactory: UsfmEditFactory;
  openDocument: (uri: string, content: string) => Promise<void>;
  /** Full-content replacement; bumps the document version. */
  changeDocument: (uri: string, content: string) => Promise<void>;
  closeDocument: (uri: string) => Promise<void>;
}

/**
 * Wires up a browser-ready Lynx workspace for USFM documents: the four
 * StandardRuleSets.English punctuation/quotation/character providers, the
 * vendored verse-order example provider, and on-type quote autocorrection.
 *
 * This is the Lynx setup Scripture Forge and the Lynx VS Code extension use,
 * minus their editor bindings — the same workspace would sit behind a Checks
 * panel or a future rich scripture editor in Fluent.
 */
export async function createLynxWorkspace(language = 'en'): Promise<LynxContext> {
  const localizer = new Localizer(language);
  registerBundlerSafeLocales(localizer);

  const stylesheet = createBrowserUsfmStylesheet();
  const documentFactory = new UsfmDocumentFactory(stylesheet);
  const editFactory = new UsfmEditFactory(stylesheet);
  const documentManager = new DocumentManager<UsfmDocument>(documentFactory);

  const ruleSet = StandardRuleSets.English;

  const workspace = new Workspace<TextEdit>({
    localizer,
    diagnosticProviders: [
      ...ruleSet.createDiagnosticProviders(localizer, documentManager, editFactory),
      new VerseOrderDiagnosticProvider(localizer, documentManager, editFactory),
    ],
    onTypeFormattingProviders: [
      ...ruleSet.createOnTypeFormattingProviders(documentManager, editFactory),
    ],
  });

  await workspace.init();

  const versions = new Map<string, number>();

  return {
    workspace,
    documentManager,
    editFactory,
    async openDocument(uri, content) {
      versions.set(uri, 1);
      await documentManager.fireOpened(uri, { format: 'usfm', version: 1, content });
    },
    async changeDocument(uri, content) {
      const version = (versions.get(uri) ?? 1) + 1;
      versions.set(uri, version);
      await documentManager.fireChanged(uri, { contentChanges: [{ text: content }], version });
    },
    async closeDocument(uri) {
      versions.delete(uri);
      await documentManager.fireClosed(uri);
    },
  };
}
