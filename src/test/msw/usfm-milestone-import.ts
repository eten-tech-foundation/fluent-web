import { http, HttpResponse } from 'msw';

import { type UsfmFileUpload, type UsfmFileVerdict } from '@/features/projects/lib/usfm-import';
import { config } from '@/lib/config';

export const PROJECT_ID = 10;
export const USFM_CHECK_URL = `${config.api.url}/projects/${PROJECT_ID}/milestones/usfm-validation`;
export const USFM_IMPORT_URL = `${config.api.url}/projects/${PROJECT_ID}/milestones/import`;

const BOOK_NAMES: Record<string, string> = {
  GEN: 'Genesis',
  MAT: 'Matthew',
  ACT: 'Acts',
  JAS: 'James',
  '1PE': '1 Peter',
  '2PE': '2 Peter',
  JUD: 'Jude',
  PHM: 'Philemon',
};

/**
 * The project the handlers check against: Matthew is in Gospels, Acts is in the project but no
 * milestone, and the Source Bible ("IRV Gujarati") lacks Philemon.
 */
const PROJECT_BOOKS: Record<string, string | null> = { MAT: 'Gospels', ACT: null };
const NOT_IN_SOURCE = new Set(['PHM']);

/**
 * Stands in for the API's check: the book is the code after `\id`, and a file without one has no
 * book data. The real detection (\toc3 and \mt names, the parse) is the API's and is tested there.
 */
export function verdictsFor(files: UsfmFileUpload[], listedBookCodes: string[] = []) {
  const listed = new Set(listedBookCodes);
  return files.map(({ fileName, usfm }): UsfmFileVerdict => {
    const bookCode = /\\id\s+(\w{3})/.exec(usfm)?.[1]?.toUpperCase();
    if (!bookCode) {
      return { fileName, ok: false, error: 'USFM_BOOK_MISSING', message: 'Missing book data.' };
    }
    const bookName = BOOK_NAMES[bookCode] ?? bookCode;
    const book = { bookCode, bookName };
    if (listed.has(bookCode)) {
      return { fileName, ok: false, error: 'USFM_BOOK_DUPLICATE', message: '', ...book };
    }
    if (bookCode in PROJECT_BOOKS) {
      const milestoneName = PROJECT_BOOKS[bookCode];
      return {
        fileName,
        ok: false,
        error: 'USFM_BOOK_EXISTS',
        message: '',
        milestoneName,
        ...book,
      };
    }
    if (NOT_IN_SOURCE.has(bookCode)) {
      return {
        fileName,
        ok: false,
        error: 'USFM_BOOK_NOT_IN_SOURCE',
        message: '',
        sourceBibleName: 'IRV Gujarati',
        ...book,
      };
    }
    listed.add(bookCode);
    return { fileName, ok: true, ...book };
  });
}

export const usfmCheckHandler = () =>
  http.post(USFM_CHECK_URL, async ({ request }) => {
    const { files, listedBookCodes } = (await request.json()) as {
      files: UsfmFileUpload[];
      listedBookCodes: string[];
    };
    return HttpResponse.json({ files: verdictsFor(files, listedBookCodes) });
  });

/** POST /projects/:id/milestones/import, creating "milestone 500" from whatever it is sent. */
export const usfmImportHandler = () =>
  http.post(USFM_IMPORT_URL, async ({ request }) => {
    const { name, files } = (await request.json()) as { name: string; files: UsfmFileUpload[] };
    const verdicts = verdictsFor(files);
    if (verdicts.some(verdict => !verdict.ok)) {
      return HttpResponse.json(
        { message: 'One or more files cannot be imported', files: verdicts },
        { status: 400 }
      );
    }
    return HttpResponse.json(
      {
        id: 500,
        name,
        status: 'not_started',
        type: 'text',
        projectId: PROJECT_ID,
        projectName: 'Kachi Koli NT',
        milestoneCount: 2,
        bookCount: files.length,
        bookIds: [],
        chapterStatusCounts: {},
      },
      { status: 201 }
    );
  });

/** jsdom's File has no usable `text()`, so the read path needs one supplied. */
export const usfmFile = (name: string, text: string): File => {
  const file = new File([text], name, { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
};

/** A one-chapter book file for `code`, named the way the #418 mockup names them. */
export const bookFile = (code: string) =>
  usfmFile(`Kachi-Koli-${code}.usfm`, `\\id ${code}\n\\c 1\n\\p\n\\v 1 text`);
