import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { type ProjectItem } from '@/lib/types';

import {
  type RepeatedWordsRequest,
  type RepeatedWordsResponse,
  type VerseInput,
} from '../checks.types';

/**
 * A drafted verse to feed into the check. `verseNumber` is the canonical verse
 * number; `content` is what the translator currently sees (drafting state, not
 * a refetch — what they see is what gets checked, per §6.2).
 */
export interface CheckVerseInput {
  verseNumber: number;
  content: string;
}

/**
 * Build the verse identifier per **W4**: `"{bookCode} {chapter}:{verse}"` using
 * the **USFM book code** (e.g. `"JDG 4:3"`).
 *
 * Implementation note (W4 resolved): `ProjectItem.bookCode` carries the USFM
 * code, whereas `ProjectItem.book` is the human display name. The drafting
 * page's editor-state persistence happens to store the display name under a key
 * it (confusingly) also calls `bookCode`; we deliberately use the real USFM
 * `projectItem.bookCode` here so `snt_id` matches the smoke-test convention.
 */
export const buildSntId = (bookCode: string, chapterNumber: number, verseNumber: number): string =>
  `${bookCode} ${chapterNumber}:${verseNumber}`;

/**
 * Assemble the snake_case `RepeatedWordsRequest` (D8 shape) from the project
 * context and the currently drafted verses. Only verses with non-empty content
 * are sent.
 */
export const buildRepeatedWordsRequest = (
  projectItem: ProjectItem,
  verses: CheckVerseInput[]
): RepeatedWordsRequest => {
  const verseInputs: VerseInput[] = verses
    .filter(v => v.content.trim() !== '')
    .map(v => ({
      snt_id: buildSntId(projectItem.bookCode, projectItem.chapterNumber, v.verseNumber),
      text: v.content,
    }));

  // `lang_code` MUST be the ISO 639-3 code (e.g. "eng"): greek-room keys its
  // legitimate-duplicate whitelist on the code, so sending the display name
  // ("English") silently disables legitimate-duplicate suppression. `lang_name`
  // carries the human name. See phase-04 manual smoke (BUG #2, 2026-06-23).
  //
  // Defensive fallback: if the API omits the code (undefined) OR sends it empty
  // (fluent-api defaults a null ISO column to ""), send "<unknown>" rather than
  // an empty/undefined value. greek-room simply won't match any legitimate
  // whitelist for an unknown code (duplicates are still flagged) — a safe
  // degradation that keeps the check running instead of crashing.
  const langCode = projectItem.targetLanguageCode?.trim() ? projectItem.targetLanguageCode : null;

  return {
    lang_code: langCode ?? '<unknown>',
    lang_name: projectItem.targetLanguage,
    // fluent-ai declares `project_id: str` (Pydantic v2, strict — it does NOT
    // coerce an int to a str), so a numeric `projectUnitId` is rejected with a
    // 422 that fluent-api surfaces as a 502. fluent-api's own schema is the
    // tolerant side (accepts string | number); we are the compliant side and
    // send the contract-correct string. See phase-04 manual smoke (2026-06-23).
    project_id: String(projectItem.projectUnitId),
    project_name: projectItem.projectName,
    verses: verseInputs,
  };
};

/** POST the request to the fluent-api proxy and return the full envelope (D9). */
export const postRepeatedWordsCheck = async (
  request: RepeatedWordsRequest
): Promise<RepeatedWordsResponse> => {
  const res = await fetch(`${config.api.url}/ai/tools/greek-room/repeated-words`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error('Failed to run repeated-words check');
  }

  return (await res.json()) as RepeatedWordsResponse;
};

export interface UseRepeatedWordsCheckParams {
  projectItem: ProjectItem;
  /** All currently drafted verses of the chapter (content from drafting state). */
  verses: CheckVerseInput[];
  /**
   * Increments on every successful verse auto-save; part of the query key so
   * the check re-fires exactly on the auto-save event (W3, card #172).
   */
  saveCounter: number;
  /**
   * When false the query is disabled — read-only `/view` route, no verse has
   * content, or any other gating the caller wants to apply (W10).
   */
  enabled?: boolean;
}

/**
 * Chapter-wide Repeated Word Check query (W3/W4/W10).
 *
 * Keyed on `(chapterAssignmentId, saveCounter)` so it re-runs on each
 * successful auto-save. Consumes the full `ToolJobResponse` envelope and
 * branches on `status`:
 *  - `completed` ⇒ the synchronous case today; findings are in `result`.
 *  - `queued` / `running` ⇒ a future async tool; the shape is identical, so a
 *    `refetchInterval` can be added later without reshaping callers (D3/D9).
 *  - `failed` / `cancelled` ⇒ fluent-api surfaces these as HTTP 502 errors, so
 *    they arrive here as `query.isError` (handled by the panel's inline error,
 *    W9). TanStack retains the last successful `data` on refetch failure.
 *
 * Follows the fetch pattern in `features/bible/hooks/useBibleTarget.ts`.
 */
export const useRepeatedWordsCheck = ({
  projectItem,
  verses,
  saveCounter,
  enabled = true,
}: UseRepeatedWordsCheckParams) => {
  const hasContent = verses.some(v => v.content.trim() !== '');

  return useQuery<RepeatedWordsResponse>({
    queryKey: ['repeated-words', projectItem.chapterAssignmentId, saveCounter],
    queryFn: async () => {
      const request = buildRepeatedWordsRequest(projectItem, verses);
      try {
        return await postRepeatedWordsCheck(request);
      } catch (error) {
        Logger.logException(error, { context: 'Repeated-words check failed' });
        throw error;
      }
    },
    enabled: enabled && hasContent,
    // Keep the last successful findings visible on refetch failure (W9); the
    // panel renders an inline error line above them.
    retry: false,
  });
};
