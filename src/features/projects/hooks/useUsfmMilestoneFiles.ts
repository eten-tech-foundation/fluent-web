import { useCallback, useEffect, useReducer, useRef } from 'react';

import { NetworkError } from '@/lib/api-utils';
import { Logger } from '@/lib/services/logger';

import {
  checkMilestoneUsfmFiles,
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
export type UsfmFileErrorReason = UsfmFileProblem | 'CHECK_NETWORK' | 'CHECK_FAILED';

/** A refused file, shown in its own box under the upload area until it is dismissed (#418). */
export interface UsfmFileError {
  id: string;
  fileName: string;
  reason: UsfmFileErrorReason;
  bookName?: string;
  milestoneName?: string | null;
  sourceBibleName?: string;
}

/**
 * Whether adding files clears the error boxes already on screen. #418 says an error stays "until
 * the user dismisses it or adds another file", but until the PM answers the question on #418 the
 * agreed default is that each box stays until its X is clicked.
 */
// Widened to boolean so the branch that reads it stays typed for both answers.
const NEW_FILES_CLEAR_ERRORS = false as boolean;

type CheckOutcome =
  | { id: string; fileName: string; usfm: string; verdict: UsfmFileVerdict }
  | { id: string; fileName: string; reason: 'USFM_INVALID' | 'CHECK_NETWORK' | 'CHECK_FAILED' };

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
      return {
        ...state,
        errors: NEW_FILES_CLEAR_ERRORS ? [] : state.errors,
        checking: state.checking + action.count,
      };
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
          errors.push({
            id: outcome.id,
            fileName: outcome.fileName,
            reason: 'USFM_BOOK_DUPLICATE',
            bookName: verdict.bookName,
          });
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
 * The Add Milestone Import tab's files (#418). Files can be added any number of times; each is
 * checked by the API as soon as it is added, against the project's books, its Source Bible and the
 * files already listed. A refused file gets its own error and never affects the others.
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

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const ids = files.map(() => nextId());
      dispatch({ type: 'checking', count: files.length });

      let outcomes: CheckOutcome[];
      try {
        const texts = await Promise.all(files.map(file => file.text()));
        // Text without a single marker never goes to the API. The rest go in one request, so
        // every file's problem shows at once.
        const toCheck = texts.flatMap((text, index) => (looksLikeUsfm(text) ? [index] : []));
        const verdicts =
          toCheck.length > 0
            ? await checkMilestoneUsfmFiles(
                projectId,
                toCheck.map(index => ({ fileName: files[index].name, usfm: texts[index] })),
                listedRef.current
              )
            : [];
        const verdictByIndex = new Map(toCheck.map((index, i) => [index, verdicts[i]]));
        outcomes = files.map((file, index) => {
          const verdict = verdictByIndex.get(index);
          return verdict
            ? { id: ids[index], fileName: file.name, usfm: texts[index], verdict }
            : { id: ids[index], fileName: file.name, reason: 'USFM_INVALID' };
        });
      } catch (error) {
        Logger.logException(error instanceof Error ? error : new Error(String(error)), {
          source: 'usfm milestone import check',
        });
        const reason = error instanceof NetworkError ? 'CHECK_NETWORK' : 'CHECK_FAILED';
        outcomes = files.map((file, index) => ({ id: ids[index], fileName: file.name, reason }));
      }
      dispatch({ type: 'checked', outcomes });
    },
    [projectId, nextId]
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

  const removeFile = useCallback((id: string) => dispatch({ type: 'remove', id }), []);
  const dismissError = useCallback((id: string) => dispatch({ type: 'dismiss', id }), []);

  return { ...state, addFiles, refuse, removeFile, dismissError };
}
