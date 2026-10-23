import { http, HttpResponse } from 'msw';

import { config } from '@/lib/config';

export const USFM_CHECK_URL = `${config.api.url}/projects/usfm-validation`;

const BOOK_NAMES: Record<string, string> = {
  GEN: 'Genesis',
  MAT: 'Matthew',
  OBA: 'Obadiah',
  PHM: 'Philemon',
};

/**
 * Stands in for the API's upload check (POST /projects/usfm-validation): the book is the code
 * after `\id`, a file without one has no book data, and a second file of a book is a duplicate.
 * The real detection (\toc3 and \mt names, the parse) is the API's and is tested there.
 */
export const usfmCheckHandler = () =>
  http.post(USFM_CHECK_URL, async ({ request }) => {
    const { files } = (await request.json()) as {
      files: Array<{ fileName: string; usfm: string }>;
    };
    const seen = new Set<string>();
    return HttpResponse.json({
      files: files.map(({ fileName, usfm }) => {
        const bookCode = /\\id\s+(\w{3})/.exec(usfm)?.[1]?.toUpperCase();
        if (!bookCode) {
          return { fileName, ok: false, error: 'USFM_BOOK_MISSING', message: 'Missing book data' };
        }
        if (seen.has(bookCode)) {
          return {
            fileName,
            ok: false,
            error: 'USFM_BOOK_DUPLICATE',
            message: 'Another file in this upload is for the same book',
          };
        }
        seen.add(bookCode);
        return { fileName, ok: true, bookCode, bookName: BOOK_NAMES[bookCode] ?? bookCode };
      }),
    });
  });
