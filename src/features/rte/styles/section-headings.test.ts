import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const styles = ['usj-nodes.css', 'editor-shared.css', 'chapter-editor.css', 'pericope-editor.css']
  .map(name => readFileSync(new URL(name, import.meta.url), 'utf8'))
  .join('\n');

afterEach(() => document.body.replaceChildren());

describe('section heading hierarchy', () => {
  it.each(['chapter-editor-surface', 'pericope-editor'])(
    'makes all four heading levels distinguishable in %s',
    surface => {
      const style = document.createElement('style');
      style.textContent = styles;
      const root = document.createElement('div');
      root.className = `rte-editor formatted-font text-spacing ${surface}`;
      root.innerHTML = [1, 2, 3, 4]
        .map(level => `<p class="usfm_s${level}">Heading ${level}</p>`)
        .join('');
      document.body.append(style, root);
      const treatments = [...root.children].map(heading => {
        const css = getComputedStyle(heading);
        return [css.fontSize, css.fontWeight, css.fontStyle].join('/');
      });
      expect(new Set(treatments).size).toBe(4);
    }
  );
});
