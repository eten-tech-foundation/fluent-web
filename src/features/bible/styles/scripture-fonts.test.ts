import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const sourceFonts = read('./source-fonts.css');
const editorStyles = ['usj-nodes.css', 'fonts.css'].map(name => read(`../../rte/styles/${name}`));
const theme = read('../../../index.css');

afterEach(() => document.body.replaceChildren());

describe('scripture font stack (#472)', () => {
  // jsdom doesn't resolve var(), so this checks which rule wins (the editor's over the vendored
  // usj-nodes one) and that all three point at the token; the next test checks the token itself.
  it('points source text, plain target text and the editor at --font-scripture', () => {
    const style = document.createElement('style');
    style.textContent = [...editorStyles, sourceFonts].join('\n');
    const root = document.createElement('div');
    root.innerHTML = [
      '<p class="source-scripture">Source</p>',
      '<p class="target-scripture">Target</p>',
      '<div class="rte-editor"><div class="usfm formatted-font">Editor</div></div>',
    ].join('');
    document.body.append(style, root);

    const families = ['.source-scripture', '.target-scripture', '.formatted-font'].map(
      selector => getComputedStyle(root.querySelector(selector) as Element).fontFamily
    );
    expect(new Set(families)).toEqual(new Set(['var(--font-scripture)']));
  });

  it('draws Latin in Inter, then Charis SIL, and the other scripts in the bundled Noto faces', () => {
    const stack = theme
      .match(/--font-scripture:([^;]+);/)?.[1]
      .split(',')
      .map(family => family.trim().replace(/^'|'$/g, ''));
    expect(stack?.slice(0, 2)).toEqual(['Inter', 'Charis SIL']);
    expect(stack).toEqual(
      expect.arrayContaining([
        'Noto Serif Devanagari',
        'Noto Serif Gujarati',
        'Noto Serif Malayalam',
        'Noto Serif Kannada',
        'Noto Serif Telugu',
        'Noto Serif Tamil',
        'Noto Naskh Arabic',
      ])
    );
  });

  it('loads Charis SIL with the source column, before the editor chunk exists', () => {
    expect(sourceFonts).toContain(`@import '../../rte/styles/charis-fonts.css';`);
    expect(sourceFonts).toContain(`@import '../../rte/styles/noto-fonts.css';`);
  });
});
