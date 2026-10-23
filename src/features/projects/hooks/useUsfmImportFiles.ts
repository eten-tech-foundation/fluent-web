import { useCallback, useRef, useState } from 'react';

import { NetworkError } from '@/lib/api-utils';
import { Logger } from '@/lib/services/logger';

import { checkUsfmFiles, type UsfmFileProblem } from '../lib/usfm-check';
import { looksLikeUsfm } from '../lib/usfm-validate';

/** A file that passed the check, with the book the API found in it. */
export interface AcceptedUsfmFile {
  file: File;
  bookCode: string;
  /** The book's English name, shown next to the file so a misnamed file stands out (#419). */
  bookName: string;
  /** The file's text, read once at upload so submit does not read it again (#419). */
  usfm: string;
}

export type UsfmImportState =
  | { status: 'idle' }
  | { status: 'checking'; fileNames: string[] }
  | {
      status: 'rejected';
      fileNames: string[];
      problems: Array<{ fileName: string; problem: UsfmFileProblem }>;
    }
  | { status: 'failed'; fileNames: string[]; reason: 'network' | 'server' }
  | { status: 'accepted'; files: AcceptedUsfmFile[] };

const IDLE: UsfmImportState = { status: 'idle' };

/**
 * The Import tab's files and their check (#418, #419): every file goes to the API, which runs
 * the same parse and book detection as Create, and the batch is accepted whole or not at all.
 */
export function useUsfmImportFiles() {
  const [state, setState] = useState<UsfmImportState>(IDLE);

  /** Which selection is current. Checking is async, so an older batch can finish last. */
  const selectionRef = useRef(0);

  const selectFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    const selection = ++selectionRef.current;
    const isCurrent = () => selection === selectionRef.current;
    const fileNames = files.map(file => file.name);
    setState({ status: 'checking', fileNames });

    try {
      const texts = await Promise.all(files.map(file => file.text()));
      if (!isCurrent()) return;

      // Text without a single marker never goes to the API; everything else does, in one request,
      // so every file's problem shows at once rather than one round of fixes at a time.
      const toCheck = files.flatMap((file, index) =>
        looksLikeUsfm(texts[index]) ? [{ file, index }] : []
      );
      const verdicts =
        toCheck.length > 0
          ? await checkUsfmFiles(
              toCheck.map(({ file, index }) => ({ fileName: file.name, usfm: texts[index] }))
            )
          : [];
      if (!isCurrent()) return;
      const verdictByIndex = new Map(toCheck.map(({ index }, i) => [index, verdicts[i]]));

      // #418 rejects the entire import if any file fails, so the batch is either accepted whole
      // or turned away with the reason for each file that failed.
      const accepted: AcceptedUsfmFile[] = [];
      const problems: Array<{ fileName: string; problem: UsfmFileProblem }> = [];
      files.forEach((file, index) => {
        const verdict = verdictByIndex.get(index);
        if (!verdict) {
          problems.push({ fileName: file.name, problem: 'USFM_INVALID' });
        } else if (verdict.ok) {
          const { bookCode, bookName } = verdict;
          accepted.push({ file, bookCode, bookName, usfm: texts[index] });
        } else {
          problems.push({ fileName: file.name, problem: verdict.error });
        }
      });

      setState(
        problems.length > 0
          ? { status: 'rejected', fileNames, problems }
          : { status: 'accepted', files: accepted }
      );
    } catch (error) {
      if (!isCurrent()) return;
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'usfm import check',
      });
      setState({
        status: 'failed',
        fileNames,
        reason: error instanceof NetworkError ? 'network' : 'server',
      });
    }
  }, []);

  return { state, selectFiles };
}
