import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { NetworkError } from '@/lib/api-utils';
import { server } from '@/test/msw/server';
import { PROJECT_ID, USFM_CHECK_URL, usfmCheckHandler } from '@/test/msw/usfm-milestone-import';

import { checkMilestoneUsfmFiles, compareBibleOrder, looksLikeUsfm } from './usfm-import';

describe('looksLikeUsfm', () => {
  it.each([
    ['\\id GEN', true],
    ['\\h Genesis\n\\c 1', true],
    ['\\mt1 Genesis', true],
    ['just a note', false],
    ['', false],
    ['C:\\ path with a backslash and a space', false],
  ])('%j → %s', (text, expected) => {
    expect(looksLikeUsfm(text)).toBe(expected);
  });
});

describe('compareBibleOrder (#420)', () => {
  it('puts books in Bible order, unknown codes last', () => {
    expect(['JUD', '2PE', 'XYZ', 'JAS', '1PE', 'GEN'].sort(compareBibleOrder)).toEqual([
      'GEN',
      'JAS',
      '1PE',
      '2PE',
      'JUD',
      'XYZ',
    ]);
  });
});

describe('checkMilestoneUsfmFiles (#418)', () => {
  beforeEach(() => {
    server.use(usfmCheckHandler());
  });

  it('returns one verdict per file, in order', async () => {
    const verdicts = await checkMilestoneUsfmFiles(
      PROJECT_ID,
      [
        { fileName: 'jud.usfm', usfm: '\\id JUD\n\\c 1' },
        { fileName: 'mat.usfm', usfm: '\\id MAT\n\\c 1' },
      ],
      []
    );

    expect(verdicts.map(verdict => [verdict.fileName, verdict.ok])).toEqual([
      ['jud.usfm', true],
      ['mat.usfm', false],
    ]);
  });

  it('rejects with a NetworkError when the request gets no answer', async () => {
    server.use(http.post(USFM_CHECK_URL, () => HttpResponse.error()));

    await expect(
      checkMilestoneUsfmFiles(PROJECT_ID, [{ fileName: 'a.usfm', usfm: '\\id JUD' }], [])
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it("passes on the API's message when it refuses the request", async () => {
    server.use(
      http.post(USFM_CHECK_URL, () =>
        HttpResponse.json({ message: 'Project has no source Bible' }, { status: 400 })
      )
    );

    await expect(
      checkMilestoneUsfmFiles(PROJECT_ID, [{ fileName: 'a.usfm', usfm: '\\id JUD' }], [])
    ).rejects.toThrow('Project has no source Bible');
  });

  it('refuses an answer that does not have a verdict for every file', async () => {
    server.use(http.post(USFM_CHECK_URL, () => HttpResponse.json({ files: [] })));

    await expect(
      checkMilestoneUsfmFiles(PROJECT_ID, [{ fileName: 'a.usfm', usfm: '\\id JUD' }], [])
    ).rejects.toThrow('Expected 1 USFM verdicts, got 0');
  });
});
