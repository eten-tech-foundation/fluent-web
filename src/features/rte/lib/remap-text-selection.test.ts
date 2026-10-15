import { describe, expect, it } from 'vitest';

import { remapTextSelection } from './remap-text-selection';

import type { Usj } from '@eten-tech-foundation/scripture-utilities';

const before: Usj = {
  type: 'USJ',
  version: '3.1',
  content: [
    {
      type: 'para',
      marker: 'p',
      content: [
        { type: 'verse', marker: 'v', number: '1' },
        'પ્રથમ વાક્ય.',
        { type: 'verse', marker: 'v', number: '2' },
        'هذا نص عربي طويل.',
      ],
    },
  ],
};
const after: Usj = {
  type: 'USJ',
  version: '3.1',
  content: [
    {
      type: 'para',
      marker: 'p',
      content: [{ type: 'verse', marker: 'v', number: '1' }, 'પ્રથમ વાક્ય.'],
    },
    {
      type: 'para',
      marker: 'q1',
      content: [{ type: 'verse', marker: 'v', number: '2' }, 'هذا نص عربي طويل.'],
    },
  ],
};

describe('remapTextSelection', () => {
  it.each([0, 8, 16])(
    'keeps the offset %s in the same RTL verse after its path changes',
    offset => {
      expect(
        remapTextSelection(before, after, {
          start: { jsonPath: '$.content[0].content[3]', offset },
        })
      ).toEqual({ start: { jsonPath: '$.content[1].content[1]', offset } });
    }
  );
  it('preserves both endpoints and their order in a backwards selection', () => {
    expect(
      remapTextSelection(before, after, {
        start: { jsonPath: '$.content[0].content[3]', offset: 11 },
        end: { jsonPath: '$.content[0].content[3]', offset: 8 },
      })
    ).toEqual({
      start: { jsonPath: '$.content[1].content[1]', offset: 11 },
      end: { jsonPath: '$.content[1].content[1]', offset: 8 },
    });
  });
  it('does not restore a stale text position when the rewrite also changed text', () => {
    const changed = structuredClone(after);
    changed.content.push('new text');
    expect(
      remapTextSelection(before, changed, {
        start: { jsonPath: '$.content[0].content[3]', offset: 8 },
      })
    ).toBeUndefined();
  });
  it('leaves marker and element positions to the verse-reference fallback', () => {
    expect(
      remapTextSelection(before, after, {
        start: { jsonPath: '$.content[0]', offset: 0 },
      })
    ).toBeUndefined();
  });
});
