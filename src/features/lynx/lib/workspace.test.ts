import { ScriptureNodeType } from '@sillsdev/lynx';
import { beforeEach, describe, expect, it } from 'vitest';

import { SAMPLE_URI, SAMPLE_USFM } from './sample-usfm';
import { applyTextEdits } from './text-edits';
import { createLynxWorkspace } from './workspace';

import type { LynxContext } from './workspace';

describe('createLynxWorkspace', () => {
  let ctx: LynxContext;

  beforeEach(async () => {
    ctx = await createLynxWorkspace();
    await ctx.openDocument(SAMPLE_URI, SAMPLE_USFM);
  });

  it('parses USFM into a typed scripture document without a server round-trip', async () => {
    const document = await ctx.documentManager.get(SAMPLE_URI);

    expect(document).toBeDefined();
    const verses = [...document!.findNodes(ScriptureNodeType.Verse)];
    expect(verses).toHaveLength(7);
  });

  it('reports the seeded quotation, verse-order, and character issues', async () => {
    const diagnostics = await ctx.workspace.getDiagnostics(SAMPLE_URI);
    const sources = new Set(diagnostics.map(d => d.source));

    expect(sources).toContain('quotation-mark-checker');
    expect(sources).toContain('verse-order');
    expect(sources).toContain('allowed-character-set-checker');
  });

  it('clears the unmatched-quote diagnostic when the quote is closed', async () => {
    const fixed = SAMPLE_USFM.replace('each of you.', 'each of you.”');
    await ctx.changeDocument(SAMPLE_URI, fixed);

    const diagnostics = await ctx.workspace.getDiagnostics(SAMPLE_URI);
    const quotation = diagnostics.filter(d => d.source === 'quotation-mark-checker');

    // The curly-quote issue in chapter 1 is resolved; only the straight-quote
    // ambiguities in chapter 2 may remain.
    expect(quotation.every(d => d.range.start.line >= 11)).toBe(true);
  });

  it('offers a quick fix that inserts a missing verse and resolves the diagnostic', async () => {
    const diagnostics = await ctx.workspace.getDiagnostics(SAMPLE_URI);
    const missingVerse4 = diagnostics.find(
      d =>
        d.source === 'verse-order' &&
        d.code === 2 &&
        (d.data as { missingVerse: number }).missingVerse === 4
    );
    expect(missingVerse4).toBeDefined();

    const fixes = await ctx.workspace.getDiagnosticFixes(SAMPLE_URI, missingVerse4!);
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0].title).toMatch(/insert/i);

    const document = await ctx.documentManager.get(SAMPLE_URI);
    const updated = applyTextEdits(document!, fixes[0].edits);
    await ctx.changeDocument(SAMPLE_URI, updated);

    const after = await ctx.workspace.getDiagnostics(SAMPLE_URI);
    const stillMissing = after.filter(
      d =>
        d.source === 'verse-order' &&
        d.code === 2 &&
        (d.data as { missingVerse: number }).missingVerse === 4
    );
    expect(stillMissing).toHaveLength(0);
    expect((await ctx.documentManager.get(SAMPLE_URI))!.getText()).toContain('\\v 4');
  });

  it('autocorrects a straight double quote as it is typed', async () => {
    const uri = 'fluent://poc/on-type.usfm';
    // The translator just typed `"` at the end of the verse line.
    const usfm = '\\id RUT\n\\c 1\n\\p\n\\v 1 She said, "\n';
    await ctx.openDocument(uri, usfm);

    expect(ctx.workspace.getOnTypeTriggerCharacters()).toContain('"');

    const typedQuoteCharacter = '\\v 1 She said, "'.length; // position just after the quote
    const edits = await ctx.workspace.getOnTypeEdits(
      uri,
      { line: 3, character: typedQuoteCharacter },
      '"'
    );

    expect(edits).toBeDefined();
    expect(edits!.length).toBeGreaterThan(0);
    expect(edits![0].newText).toBe('“');
  });
});
