import { fetchOrNetworkError, parseErrorMessage } from '@/lib/api-utils';
import { config } from '@/lib/config';

/** Why the API turned a file away at upload. */
export type UsfmFileProblem = 'USFM_INVALID' | 'USFM_BOOK_MISSING' | 'USFM_BOOK_DUPLICATE';

/** The API's answer for one file: the book it is for, or why it was rejected. */
export type UsfmFileVerdict =
  | { fileName: string; ok: true; bookCode: string; bookName: string }
  | { fileName: string; ok: false; error: UsfmFileProblem; message: string };

/**
 * Runs the API's own import parse and book detection over the files without creating anything
 * (#418, #419), so a file the upload step accepts is one project creation accepts too. The
 * answer has one verdict per file, in the order sent.
 */
export async function checkUsfmFiles(
  files: Array<{ fileName: string; usfm: string }>
): Promise<UsfmFileVerdict[]> {
  const res = await fetchOrNetworkError(`${config.api.url}/projects/usfm-validation`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  if (!res.ok) await parseErrorMessage(res, 'Failed to check the USFM files');

  const { files: verdicts } = (await res.json()) as { files: UsfmFileVerdict[] };
  if (verdicts.length !== files.length) {
    throw new Error(`Expected ${files.length} USFM verdicts, got ${verdicts.length}`);
  }
  return verdicts;
}
