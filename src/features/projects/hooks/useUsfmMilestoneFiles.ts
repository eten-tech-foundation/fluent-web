import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { NetworkError } from '@/lib/api-utils';
import { Logger } from '@/lib/services/logger';

import {
  checkMilestoneUsfmFiles,
  isUsfmFileName,
  looksLikeUsfm,
  type UsfmFileProblem,
  type UsfmFileVerdict,
} from '../lib/usfm-import';

/** A file in the Import tab's list: it passed the check, and the API named its book. */
export interface ListedUsfmFile {
  id: string;
  fileName: string;
  bookCode: string;
  /** The book's English name, for Book(s) (#420). */
  bookName: string;
  /** The file's text, read once at upload so the import does not read it again. */
  usfm: string;
}

/** A problem with the file itself, or the check itself failing (no answer, or an error). */
export type UsfmFileErrorReason =
  | UsfmFileProblem
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_UNREADABLE'
  | 'CHECK_NETWORK'
  | 'CHECK_FAILED';

/**
 * A refused file, shown in its own box under the upload area. Adding more files leaves it there;
 * only its X takes it away (Chad on #418).
 */
export interface UsfmFileError {
  id: string;
  fileName: string;
  reason: UsfmFileErrorReason;
  bookName?: string;
  milestoneName?: string | null;
  sourceBibleName?: string;
}

type CheckOutcome =
  | { id: string; fileName: string; usfm: string; verdict: UsfmFileVerdict }
  | {
      id: string;
      fileName: string;
      reason:
        | 'USFM_INVALID'
        | 'UNSUPPORTED_FILE_TYPE'
        | 'FILE_UNREADABLE'
        | 'CHECK_NETWORK'
        | 'CHECK_FAILED';
    };

/**
 * How many check requests are open at once, across every add. Each file has a request of its own,
 * so a drop of a whole Testament, or a second drop right after the first, still doesn't send every
 * file to the API at the same moment.
 */
const CHECKS_AT_ONCE = 4;

/**
 * Runs tasks at most `limit` at a time, for every caller together; the rest wait their turn in
 * order. A finished task hands its place straight to the next one, so the limit holds in between.
 */
function createLimiter(limit: number) {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async function limited<T>(task: () => Promise<T>): Promise<T> {
    if (running < limit) running += 1;
    else await new Promise<void>(resolve => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running -= 1;
    }
  };
}

interface State {
  files: ListedUsfmFile[];
  errors: UsfmFileError[];
  /** How many added files are still being checked; Import waits for none (#420). */
  checking: number;
}

type Action =
  | { type: 'checking'; count: number }
  | { type: 'checked'; outcomes: CheckOutcome[] }
  | { type: 'refused'; fileIds: string[]; errors: UsfmFileError[] }
  | { type: 'remove'; id: string }
  | { type: 'dismiss'; id: string };

const errorFromVerdict = (
  id: string,
  verdict: Extract<UsfmFileVerdict, { ok: false }>
): UsfmFileError => ({
  id,
  fileName: verdict.fileName,
  reason: verdict.error,
  bookName: verdict.bookName,
  milestoneName: verdict.milestoneName,
  sourceBibleName: verdict.sourceBibleName,
});

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'checking':
      return { ...state, checking: state.checking + action.count };
    case 'checked': {
      const files = [...state.files];
      const errors = [...state.errors];
      for (const outcome of action.outcomes) {
        if (!('verdict' in outcome)) {
          errors.push({ id: outcome.id, fileName: outcome.fileName, reason: outcome.reason });
          continue;
        }
        const { verdict } = outcome;
        if (!verdict.ok) {
          errors.push(errorFromVerdict(outcome.id, verdict));
        } else if (files.some(file => file.bookCode === verdict.bookCode)) {
          // Two adds checked at the same time can't see each other's books, so the one that
          // finishes second is caught here instead.
          errors.push(
            errorFromVerdict(outcome.id, {
              ...verdict,
              ok: false,
              error: 'USFM_BOOK_DUPLICATE',
              message: '',
            })
          );
        } else {
          files.push({
            id: outcome.id,
            fileName: outcome.fileName,
            bookCode: verdict.bookCode,
            bookName: verdict.bookName,
            usfm: outcome.usfm,
          });
        }
      }
      return { files, errors, checking: state.checking - action.outcomes.length };
    }
    case 'refused':
      return {
        ...state,
        files: state.files.filter(file => !action.fileIds.includes(file.id)),
        errors: [...state.errors, ...action.errors],
      };
    case 'remove':
      return { ...state, files: state.files.filter(file => file.id !== action.id) };
    case 'dismiss':
      return { ...state, errors: state.errors.filter(error => error.id !== action.id) };
  }
}

const INITIAL_STATE: State = { files: [], errors: [], checking: 0 };

/**
 * The Add Milestone Import tab's files (#418). Files can be added any number of times. A file that
 * isn't .usfm or .sfm is refused at once; every other one is checked by the API as soon as it is
 * added, in a request of its own, against the project's books, its Source Bible and the files
 * already listed. A refused file gets its own error and never affects the others.
 */
export function useUsfmMilestoneFiles(projectId: number) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const idRef = useRef(0);
  const nextId = useCallback(() => `usfm-${++idRef.current}`, []);

  // The books listed when a check is sent, read from a ref so addFiles keeps one identity.
  const listedRef = useRef<string[]>([]);
  useEffect(() => {
    listedRef.current = state.files.map(file => file.bookCode);
  }, [state.files]);

  // One limit for every add, so files added before the earlier ones are checked wait their turn.
  const [limitChecks] = useState(() => createLimiter(CHECKS_AT_ONCE));

  /** What became of one added file; never throws, since every failure is that file's error. */
  const checkFile = useCallback(
    async (id: string, file: File): Promise<CheckOutcome> => {
      const refused = (reason: Extract<CheckOutcome, { reason: string }>['reason']) => ({
        id,
        fileName: file.name,
        reason,
      });
      if (!isUsfmFileName(file.name)) return refused('UNSUPPORTED_FILE_TYPE');

      let usfm: string;
      try {
        usfm = await file.text();
      } catch {
        // A file moved or deleted since it was picked.
        return refused('FILE_UNREADABLE');
      }
      // Text without a single marker never goes to the API.
      if (!looksLikeUsfm(usfm)) return refused('USFM_INVALID');

      try {
        // The listed books are read when the request goes out, after any wait for its turn.
        const [verdict] = await limitChecks(() =>
          checkMilestoneUsfmFiles(projectId, [{ fileName: file.name, usfm }], listedRef.current)
        );
        return { id, fileName: file.name, usfm, verdict };
      } catch (error) {
        Logger.logException(error instanceof Error ? error : new Error(String(error)), {
          source: 'usfm milestone import check',
        });
        return refused(error instanceof NetworkError ? 'CHECK_NETWORK' : 'CHECK_FAILED');
      }
    },
    [projectId, limitChecks]
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const ids = files.map(() => nextId());
      dispatch({ type: 'checking', count: files.length });
      // A request per file, so one the API can't check (a server error, a file over its size
      // limit) refuses only that file instead of every file dropped with it (#418 QA). The
      // results still land together, in the order the files came.
      const outcomes = await Promise.all(files.map((file, index) => checkFile(ids[index], file)));
      dispatch({ type: 'checked', outcomes });
    },
    [checkFile, nextId]
  );

  /** Takes the files the import refused off the list, each with its error (`verdicts` in `sent` order). */
  const refuse = useCallback(
    (sent: ListedUsfmFile[], verdicts: UsfmFileVerdict[]) => {
      const refused = sent.flatMap((file, index) => {
        const verdict = verdicts.at(index);
        return verdict && !verdict.ok ? [{ file, verdict }] : [];
      });
      dispatch({
        type: 'refused',
        fileIds: refused.map(({ file }) => file.id),
        errors: refused.map(({ verdict }) => errorFromVerdict(nextId(), verdict)),
      });
      return refused.length;
    },
    [nextId]
  );

  /**
   * The project gained one of `sent`'s books after the upload check, so the import was refused as
   * a whole (409). Checking the files again names the book and takes its file off the list.
   * Returns how many files were refused; 0 when none was, or the check itself failed.
   */
  const recheck = useCallback(
    async (sent: ListedUsfmFile[]) => {
      try {
        const verdicts = await checkMilestoneUsfmFiles(projectId, sent, []);
        return refuse(sent, verdicts);
      } catch (error) {
        Logger.logException(error instanceof Error ? error : new Error(String(error)), {
          source: 'usfm milestone import recheck',
        });
        return 0;
      }
    },
    [projectId, refuse]
  );

  const removeFile = useCallback((id: string) => dispatch({ type: 'remove', id }), []);
  const dismissError = useCallback((id: string) => dispatch({ type: 'dismiss', id }), []);

  return { ...state, addFiles, refuse, recheck, removeFile, dismissError };
}
