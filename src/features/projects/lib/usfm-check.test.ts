import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { NetworkError } from '@/lib/api-utils';
import { server } from '@/test/msw/server';
import { USFM_CHECK_URL, usfmCheckHandler } from '@/test/msw/usfm-check';

import { checkUsfmFiles } from './usfm-check';

const GEN = { fileName: 'gen.usfm', usfm: '\\id GEN\n\\c 1\n\\v 1 text' };

describe('checkUsfmFiles', () => {
  it('sends the files to the API and returns its verdict for each', async () => {
    let sent: unknown;
    server.use(
      http.post(USFM_CHECK_URL, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          files: [{ fileName: 'gen.usfm', ok: true, bookCode: 'GEN', bookName: 'Genesis' }],
        });
      })
    );

    await expect(checkUsfmFiles([GEN])).resolves.toEqual([
      { fileName: 'gen.usfm', ok: true, bookCode: 'GEN', bookName: 'Genesis' },
    ]);
    expect(sent).toEqual({ files: [GEN] });
  });

  it('passes a rejected file on as a verdict, not an error', async () => {
    server.use(usfmCheckHandler());

    await expect(
      checkUsfmFiles([{ fileName: 'x.usfm', usfm: '\\c 1\n\\v 1 text' }])
    ).resolves.toEqual([
      { fileName: 'x.usfm', ok: false, error: 'USFM_BOOK_MISSING', message: 'Missing book data' },
    ]);
  });

  it('throws a NetworkError when the request gets no answer', async () => {
    server.use(http.post(USFM_CHECK_URL, () => HttpResponse.error()));

    await expect(checkUsfmFiles([GEN])).rejects.toBeInstanceOf(NetworkError);
  });

  it("throws with the API's message when it refuses the request", async () => {
    server.use(
      http.post(USFM_CHECK_URL, () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
      )
    );

    await expect(checkUsfmFiles([GEN])).rejects.toThrow('Internal Server Error');
  });

  it('throws when the answer does not cover every file', async () => {
    server.use(http.post(USFM_CHECK_URL, () => HttpResponse.json({ files: [] })));

    await expect(checkUsfmFiles([GEN])).rejects.toThrow('Expected 1 USFM verdicts, got 0');
  });
});
