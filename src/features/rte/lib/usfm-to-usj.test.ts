import { describe, expect, it } from 'vitest';

import { usfmToUsj } from './usfm-to-usj';

const USFM =
  '\\id GEN\n\\h Genesis\n\\mt Genesis\n' +
  '\\c 1\n\\p\n\\v 1 First words.\n\\v 2 Second words.\n' +
  '\\c 2\n\\p\n\\v 1 Other chapter.\n' +
  '\n';

describe('usfmToUsj', () => {
  it('converts the curated assembled subset into normalized USJ', () => {
    expect(usfmToUsj(USFM)).toEqual({
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'book', marker: 'id', code: 'GEN', content: [] },
        { type: 'para', marker: 'h', content: ['Genesis'] },
        { type: 'para', marker: 'mt', content: ['Genesis'] },
        { type: 'chapter', marker: 'c', number: '1', sid: 'GEN 1' },
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: 'GEN 1:1' },
            'First words.',
            { type: 'verse', marker: 'v', number: '2', sid: 'GEN 1:2' },
            'Second words.',
          ],
        },
        { type: 'chapter', marker: 'c', number: '2', sid: 'GEN 2' },
        {
          type: 'para',
          marker: 'p',
          content: [{ type: 'verse', marker: 'v', number: '1', sid: 'GEN 2:1' }, 'Other chapter.'],
        },
      ],
    });
  });

  it('keeps the id description and skips empty verse text', () => {
    const usj = usfmToUsj('\\id RUT Ruth draft\n\\c 1\n\\p\n\\v 1 \n\\v 2 Real text.\n');

    expect(usj.content[0]).toEqual({
      type: 'book',
      marker: 'id',
      code: 'RUT',
      content: ['Ruth draft'],
    });
    const para = usj.content.at(-1) as { content: unknown[] };
    expect(para.content).toEqual([
      { type: 'verse', marker: 'v', number: '1', sid: 'RUT 1:1' },
      { type: 'verse', marker: 'v', number: '2', sid: 'RUT 1:2' },
      'Real text.',
    ]);
  });
});
