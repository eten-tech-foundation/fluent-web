import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const sourceFonts = read('./source-fonts.css');
const editorFonts = read('../../rte/styles/fonts.css');
const theme = read('../../../index.css');

/** The `font-family` value of the rule that opens with `selector`, whitespace collapsed. */
function familyOf(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf('}', start));
  return body
    .match(/font-family:\s*([^;]+);/)?.[1]
    .replace(/\s+/g, ' ')
    .trim();
}

describe('scripture font stack (#472)', () => {
  it('gives source text, plain target text and the editor the same stack', () => {
    expect(familyOf(sourceFonts, '.source-scripture,\n.target-scripture')).toBe(
      'var(--font-scripture)'
    );
    expect(familyOf(editorFonts, '.rte-editor .usfm.formatted-font')).toBe('var(--font-scripture)');
  });

  it('draws Latin in Inter, then Charis SIL, and the other scripts in the bundled Noto faces', () => {
    const stack = theme
      .match(/--font-scripture:([^;]+);/)?.[1]
      .split(',')
      .map(family => family.trim().replace(/^'|'$/g, ''));
    expect(stack?.slice(0, 9)).toEqual([
      'Inter',
      'Charis SIL',
      'Noto Serif Devanagari',
      'Noto Serif Gujarati',
      'Noto Serif Malayalam',
      'Noto Serif Kannada',
      'Noto Serif Telugu',
      'Noto Serif Tamil',
      'Noto Naskh Arabic',
    ]);
    expect(stack?.at(-1)).toBe('serif');
  });

  it('loads Charis SIL with the source column, before the editor chunk exists', () => {
    for (const face of ['400', '400-italic', '700', '700-italic']) {
      expect(sourceFonts).toContain(`@import '@fontsource/charis-sil/${face}.css';`);
    }
    expect(sourceFonts).toContain(`@import '../../rte/styles/noto-fonts.css';`);
  });
});
