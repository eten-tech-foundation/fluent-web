import { VALID_BOOK_CODES } from '@eten-tech-foundation/scripture-utilities';

import { parseErrorMessage, postJson } from '@/lib/api-utils';
import { config } from '@/lib/config';

/** Why the API refused a file for the Add Milestone import (#418). */
export type UsfmFileProblem =
  | 'USFM_INVALID'
  | 'USFM_BOOK_MISSING'
  | 'USFM_BOOK_DUPLICATE'
  | 'USFM_BOOK_EXISTS'
  | 'USFM_BOOK_NOT_IN_SOURCE';

/** The API's answer for one file: the book it is for, or why it was refused. */
export type UsfmFileVerdict =
  | { fileName: string; ok: true; bookCode: string; bookName: string }
  | {
      fileName: string;
      ok: false;
      error: UsfmFileProblem;
      message: string;
      bookCode?: string;
      bookName?: string;
      /** The milestone that holds the book; null when the book is in the project but no milestone. */
      milestoneName?: string | null;
      sourceBibleName?: string;
    };

export interface UsfmFileUpload {
  fileName: string;
  usfm: string;
}

/** Only the name and text of each file go to the API, whatever else the caller keeps on it. */
export const toUploads = (files: UsfmFileUpload[]): UsfmFileUpload[] =>
  files.map(({ fileName, usfm }) => ({ fileName, usfm }));

/** The only files the Import tab takes; the file picker offers just these. */
export const USFM_FILE_EXTENSIONS = ['.usfm', '.sfm'];

/**
 * Whether a file is a USFM file by its name, in any letter case. Anything else (a PDF, a Word
 * document, a .txt) is refused before it is read, so it never reaches the API (Chad on #418).
 */
export function isUsfmFileName(fileName: string): boolean {
  const name = fileName.toLowerCase();
  return USFM_FILE_EXTENSIONS.some(extension => name.endsWith(extension));
}

/** Any USFM marker: a backslash and a marker name, such as `\id`, `\c` or `\mt1`. */
const MARKER = /\\[a-zA-Z]+\d*/;

/**
 * A first look at a .usfm or .sfm file before it goes to the API: text without a single USFM
 * marker (an empty file, notes saved under the wrong name) is refused here. Everything else,
 * which book it is and whether it parses, is the API's call, so the upload check and the import
 * cannot disagree (#418, #419).
 */
export function looksLikeUsfm(text: string): boolean {
  return MARKER.test(text);
}

const BIBLE_ORDER = new Map<string, number>(VALID_BOOK_CODES.map((code, index) => [code, index]));

/** Sorts books into Bible order by their USFM code, as #420 lists them (James before 1 Peter). */
export function compareBibleOrder(a: string, b: string): number {
  return (
    (BIBLE_ORDER.get(a) ?? Number.MAX_SAFE_INTEGER) -
    (BIBLE_ORDER.get(b) ?? Number.MAX_SAFE_INTEGER)
  );
}

/**
 * Runs the import's own book detection and checks over files without creating anything (#418):
 * the parse, the books the project already holds and the project's Source Bible.
 * `listedBookCodes` are the books already in the dialog's list, so a second file for one of them
 * comes back as a duplicate. The answer has one verdict per file, in the order sent. The Import
 * tab sends one file per request, so a request that fails takes only its own file with it.
 */
export async function checkMilestoneUsfmFiles(
  projectId: number,
  files: UsfmFileUpload[],
  listedBookCodes: string[]
): Promise<UsfmFileVerdict[]> {
  const res = await postJson(`${config.api.url}/projects/${projectId}/milestones/usfm-validation`, {
    files: toUploads(files),
    listedBookCodes,
  });
  if (!res.ok) await parseErrorMessage(res, 'Failed to check the USFM files');

  const { files: verdicts } = (await res.json()) as { files: UsfmFileVerdict[] };
  if (verdicts.length !== files.length) {
    throw new Error(`Expected ${files.length} USFM verdicts, got ${verdicts.length}`);
  }
  return verdicts;
}

/** The import refused one or more files; `verdicts` has one entry per file sent, in order. */
export class UsfmImportRejectedError extends Error {
  readonly verdicts: UsfmFileVerdict[];

  constructor(verdicts: UsfmFileVerdict[]) {
    super('One or more files cannot be imported');
    this.name = 'UsfmImportRejectedError';
    this.verdicts = verdicts;
  }
}

/** The project gained one of the books between the upload check and the import (409). */
export class UsfmImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsfmImportConflictError';
  }
}
