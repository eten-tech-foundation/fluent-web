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
export type UsfmFileErrorReason =
  | UsfmFileProblem
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
      reason: 'USFM_INVALID' | 'FILE_UNREADABLE' | 'CHECK_NETWORK' | 'CHECK_FAILED';
    };

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
        // A file that can't be read (a dropped folder, a file removed since it was picked) is
        // refused on its own; the rest of the drop is still checked.
        const reads = await Promise.allSettled(files.map(file => file.text()));
        const texts = reads.map(read => (read.status === 'fulfilled' ? read.value : null));
        // Text without a single marker never goes to the API. The rest go in one request, so
        // every file's problem shows at once.
        const toCheck = texts.flatMap((text, index) =>
          text !== null && looksLikeUsfm(text) ? [index] : []
        );
        const verdicts =
          toCheck.length > 0
            ? await checkMilestoneUsfmFiles(
                projectId,
                toCheck.map(index => ({ fileName: files[index].name, usfm: texts[index] ?? '' })),
                listedRef.current
              )
            : [];
        const verdictByIndex = new Map(toCheck.map((index, i) => [index, verdicts[i]]));
        outcomes = files.map((file, index) => {
          const verdict = verdictByIndex.get(index);
          const text = texts[index];
          if (verdict && text !== null) {
            return { id: ids[index], fileName: file.name, usfm: text, verdict };
          }
          return {
            id: ids[index],
            fileName: file.name,
            reason: text === null ? 'FILE_UNREADABLE' : 'USFM_INVALID',
          };
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
