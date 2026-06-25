import { createElement, type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { type ProjectItem } from '@/lib/types';
import { server } from '@/test/msw/server';
import { createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { type RepeatedWordsResponse } from '../checks.types';

import {
  buildRepeatedWordsRequest,
  buildSntId,
  type CheckVerseInput,
  useRepeatedWordsCheck,
} from './useRepeatedWordsCheck';

const CHECK_URL = `${config.api.url}/ai/tools/greek-room/repeated-words`;

/**
 * A QueryClientProvider wrapper pinned to one client for the test's lifetime,
 * so a `rerender(...)` doesn't swap in a fresh client and reset the cache.
 * (`@/test/render`'s `renderHook` is the raw Testing Library one — no providers.)
 * This file is `.test.ts` (no JSX), so the element is built with `createElement`.
 */
const makeWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

/** A ProjectItem with the fields the check reads; the rest are filler. */
const makeProjectItem = (over: Partial<ProjectItem> = {}): ProjectItem => ({
  chapterAssignmentId: 42,
  projectId: 100,
  projectName: 'Test Project',
  projectUnitId: 7,
  bibleId: 1,
  bibleName: 'Test Bible',
  // `targetLanguage` is the human display NAME; the check must send it as
  // `lang_name`, NOT as `lang_code` (greek-room keys its legitimate-duplicate
  // whitelist on the ISO code). See phase-04 manual smoke (BUG #2, 2026-06-23).
  targetLanguage: 'Spanish',
  // `targetLanguageCode` is the ISO 639-3 code the check must send as `lang_code`.
  targetLanguageCode: 'spa',
  bookId: 7,
  // `book` is the human display name; the check must NOT use it for snt_id.
  book: 'Judges',
  chapterStatus: 'draft',
  chapterNumber: 4,
  totalVerses: 24,
  completedVerses: 0,
  submittedTime: null,
  // `bookCode` is the USFM code the check builds snt_id from (W4).
  bookCode: 'JDG',
  sourceLangCode: 'eng',
  ...over,
});

/** A completed-envelope response with the given findings count. */
const makeResponse = (findingsCount = 0): RepeatedWordsResponse => ({
  job_id: 'job-1',
  tool: 'greek-room/repeated-words',
  status: 'completed',
  result: {
    lang_code: 'spa',
    provider: 'greek-room',
    check: 'repeated-words',
    findings: Array.from({ length: findingsCount }, (_, i) => ({
      snt_id: 'JDG 4:3',
      repeated_word: 'the the',
      surf: 'the the',
      start_position: i,
      legitimate: false,
      severity: 0.5,
    })),
    summary: { total_findings: findingsCount, legitimate_count: 0, verse_count: 1 },
  },
  error: null,
  created_at: '2026-06-21T00:00:00Z',
  completed_at: '2026-06-21T00:00:01Z',
});

/** Register a POST handler that captures the request body and returns a body. */
const mockPost = (response: RepeatedWordsResponse = makeResponse(0), status = 200) => {
  const calls: { count: number; lastBody: unknown } = { count: 0, lastBody: undefined };
  server.use(
    http.post(CHECK_URL, async ({ request }) => {
      calls.count += 1;
      calls.lastBody = await request.json();
      return HttpResponse.json(response, { status });
    })
  );
  return calls;
};

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------

describe('buildSntId', () => {
  it('formats "{bookCode} {chapter}:{verse}" with the USFM book code', () => {
    expect(buildSntId('JDG', 4, 3)).toBe('JDG 4:3');
  });
});

describe('buildRepeatedWordsRequest', () => {
  it('uses projectItem.bookCode (USFM) not projectItem.book for snt_id', () => {
    const request = buildRepeatedWordsRequest(makeProjectItem(), [
      { verseNumber: 3, content: 'the the cat' },
    ]);
    expect(request.verses[0].snt_id).toBe('JDG 4:3');
  });

  it('drops empty/whitespace-only verses', () => {
    const verses: CheckVerseInput[] = [
      { verseNumber: 1, content: '   ' },
      { verseNumber: 2, content: '' },
      { verseNumber: 3, content: 'real content' },
    ];
    const request = buildRepeatedWordsRequest(makeProjectItem(), verses);
    expect(request.verses).toHaveLength(1);
    expect(request.verses[0]).toEqual({ snt_id: 'JDG 4:3', text: 'real content' });
  });

  it('carries the snake_case project context (D8 wire shape)', () => {
    const request = buildRepeatedWordsRequest(makeProjectItem(), [
      { verseNumber: 3, content: 'x' },
    ]);
    expect(request).toMatchObject({
      // lang_code is the ISO 639-3 CODE; lang_name is the human display NAME.
      lang_code: 'spa',
      lang_name: 'Spanish',
      // project_id is sent as a STRING: fluent-ai declares it `str` (strict), so
      // a numeric value is rejected 422 → 502. See the phase-04 manual smoke.
      project_id: '7',
      project_name: 'Test Project',
    });
  });

  it('sends the ISO code as lang_code and the display name as lang_name (BUG #2 regression)', () => {
    // Greek-room keys its legitimate-duplicate whitelist on the ISO 639-3 code
    // (e.g. "eng" recognises "truly truly"); sending the display name ("English")
    // silently disables legitimate-duplicate suppression. lang_code MUST be the
    // code, lang_name the name. See phase-04 manual smoke (BUG #2, 2026-06-23).
    const request = buildRepeatedWordsRequest(
      makeProjectItem({ targetLanguage: 'English', targetLanguageCode: 'eng' }),
      [{ verseNumber: 3, content: 'truly truly' }]
    );
    expect(request.lang_code).toBe('eng');
    expect(request.lang_name).toBe('English');
    // Guard against a regression that sends the name as the code.
    expect(request.lang_code).not.toBe('English');
  });

  it('falls back to "<unknown>" when targetLanguageCode is empty (no crash)', () => {
    // `targetLanguageCode` is a required `string` (BUG #3 made it non-optional so
    // the compiler catches any ProjectItem constructor that omits it). The runtime
    // fallback still degrades gracefully: an empty/whitespace code becomes
    // "<unknown>" on the wire rather than producing undefined/empty.
    const request = buildRepeatedWordsRequest(
      makeProjectItem({ targetLanguage: 'English', targetLanguageCode: '' }),
      [{ verseNumber: 3, content: 'truly truly' }]
    );
    // greek-room just won't match any legitimate whitelist for an unknown code.
    expect(request.lang_code).toBe('<unknown>');
    expect(request.lang_name).toBe('English');
  });

  it('sends project_id as a string (fluent-ai requires str, not int)', () => {
    const request = buildRepeatedWordsRequest(makeProjectItem({ projectUnitId: 123 }), [
      { verseNumber: 3, content: 'x' },
    ]);
    expect(typeof request.project_id).toBe('string');
    expect(request.project_id).toBe('123');
  });
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

describe('useRepeatedWordsCheck — enabled gating', () => {
  it('does not fire when disabled', async () => {
    const calls = mockPost();
    renderHook(
      () =>
        useRepeatedWordsCheck({
          projectItem: makeProjectItem(),
          verses: [{ verseNumber: 3, content: 'the the' }],
          saveCounter: 0,
          enabled: false,
        }),
      { wrapper: makeWrapper() }
    );
    // Give any rogue request a tick to land.
    await new Promise(r => setTimeout(r, 50));
    expect(calls.count).toBe(0);
  });

  it('does not fire when no verse has content (even if enabled)', async () => {
    const calls = mockPost();
    renderHook(
      () =>
        useRepeatedWordsCheck({
          projectItem: makeProjectItem(),
          verses: [{ verseNumber: 3, content: '   ' }],
          saveCounter: 0,
          enabled: true,
        }),
      { wrapper: makeWrapper() }
    );
    await new Promise(r => setTimeout(r, 50));
    expect(calls.count).toBe(0);
  });

  it('fires and returns the completed envelope when enabled with content', async () => {
    mockPost(makeResponse(2));
    const { result } = renderHook(
      () =>
        useRepeatedWordsCheck({
          projectItem: makeProjectItem(),
          verses: [{ verseNumber: 3, content: 'the the' }],
          saveCounter: 0,
          enabled: true,
        }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe('completed');
    expect(result.current.data?.result?.findings).toHaveLength(2);
  });
});

describe('useRepeatedWordsCheck — saveCounter re-fires', () => {
  it('re-runs the check when saveCounter changes', async () => {
    const calls = mockPost(makeResponse(1));
    const { result, rerender } = renderHook(
      (saveCounter: number) =>
        useRepeatedWordsCheck({
          projectItem: makeProjectItem(),
          verses: [{ verseNumber: 3, content: 'the the' }],
          saveCounter,
          enabled: true,
        }),
      { initialProps: 0, wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.count).toBe(1);

    rerender(1);
    await waitFor(() => expect(calls.count).toBe(2));
  });
});

describe('useRepeatedWordsCheck — error handling', () => {
  it('surfaces a non-2xx as query.isError (no retry)', async () => {
    mockPost(makeResponse(0), 502);
    const { result } = renderHook(
      () =>
        useRepeatedWordsCheck({
          projectItem: makeProjectItem(),
          verses: [{ verseNumber: 3, content: 'the the' }],
          saveCounter: 0,
          enabled: true,
        }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('buildRepeatedWordsRequest — additional edge cases', () => {
  it('sends only verses with non-empty content (mixed empty and non-empty)', () => {
    const request = buildRepeatedWordsRequest(makeProjectItem(), [
      { verseNumber: 1, content: 'real text' },
      { verseNumber: 2, content: '' },
      { verseNumber: 3, content: '   ' },
      { verseNumber: 4, content: 'more text' },
    ]);
    expect(request.verses).toHaveLength(2);
    expect(request.verses.map(v => v.snt_id)).toEqual(['JDG 4:1', 'JDG 4:4']);
  });

  it('sends an empty verses array when all content is blank', () => {
    const request = buildRepeatedWordsRequest(makeProjectItem(), [
      { verseNumber: 1, content: '' },
      { verseNumber: 2, content: '   ' },
    ]);
    expect(request.verses).toHaveLength(0);
  });

  it('builds snt_id from chapterNumber on projectItem (not a hardcoded chapter)', () => {
    const request = buildRepeatedWordsRequest(makeProjectItem({ chapterNumber: 12 }), [
      { verseNumber: 5, content: 'text' },
    ]);
    expect(request.verses[0].snt_id).toBe('JDG 12:5');
  });

  it('uses whitespace-trimmed targetLanguageCode — empty after trim falls back to <unknown>', () => {
    const request = buildRepeatedWordsRequest(makeProjectItem({ targetLanguageCode: '   ' }), [
      { verseNumber: 1, content: 'text' },
    ]);
    expect(request.lang_code).toBe('<unknown>');
  });
});
