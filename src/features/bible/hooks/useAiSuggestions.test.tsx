import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAiSuggestions } from '@/features/bible/hooks/useAiSuggestions';
import { useAppStore } from '@/store/store';
import { server } from '@/test/msw/server';

const mapping = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => [101 + index, index + 1])
);
const pericope = {
  verseNumbers: [4, 5, 6, 7, 8],
  nextVerseNumbers: [9, 10],
  pericopeNumbers: ['2', '3'],
  titleVerseNumbers: {} as Record<string, number>,
};
const api = 'https://api.test.local/ai-suggestions';

function setup(enabled = true, canSuggest = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ activeVerse = 4, enabled: aiEnabled = enabled, scope = pericope, unit = 1 }) =>
      useAiSuggestions(unit, 2, 'GEN', 1, mapping, activeVerse, aiEnabled, {
        pericope: scope,
        canSuggest,
        draftedVerseNumbers: [1, 2, 3],
      }),
    { wrapper, initialProps: { activeVerse: 4, enabled, scope: pericope, unit: 1 } }
  );
}

describe('pericope AI requests', () => {
  let queued: string[][];
  let gets: number;
  let readyVerses: number[];
  let headingReady: boolean;
  let headingGets: number;

  beforeEach(() => {
    queued = [];
    gets = 0;
    readyVerses = [4, 5, 6, 7, 8, 9, 10];
    headingReady = false;
    headingGets = 0;
    useAppStore.setState({ isAiThresholdMet: false });
    server.use(
      http.get(`${api}/pericopes`, () => {
        headingGets += 1;
        return HttpResponse.json({
          data: headingReady
            ? [{ pericopeNumber: '2', bibleTextId: 104, suggestedText: 'A section title' }]
            : [],
        });
      }),
      http.post(`${api}/queue-pericopes`, async ({ request }) => {
        queued.push(((await request.json()) as { pericopeNumbers: string[] }).pericopeNumbers);
        return HttpResponse.json({ queued: true, thresholdMet: true });
      }),
      http.get(api, () => {
        gets += 1;
        return HttpResponse.json({
          data: readyVerses.map(number => ({
            bibleTextId: 100 + number,
            suggestedText: `Draft ${number}`,
          })),
        });
      })
    );
  });

  it('queues every verse in a long active group and the next group', async () => {
    const { result } = setup();
    await waitFor(() => expect(queued).toEqual([['2', '3']]));
    await waitFor(() => expect(result.current.suggestions[10]).toBe('Draft 10'));
    expect(result.current.suggestionStatus).toBe('idle');
  });

  it('does not restart work when focus moves within the same group', async () => {
    const { rerender, result } = setup();
    await waitFor(() => expect(result.current.suggestions[10]).toBe('Draft 10'));
    await waitFor(() => expect(queued).toHaveLength(1));
    const count = gets;
    rerender({ activeVerse: 6, enabled: true, scope: pericope, unit: 1 });
    expect(queued).toHaveLength(1);
    expect(gets).toBe(count);
  });

  it('keeps fetching later verses when the focused verse is already ready', async () => {
    readyVerses = [4];
    const { result } = setup();
    await waitFor(() => expect(result.current.suggestions[4]).toBe('Draft 4'));
    expect(result.current.suggestionStatus).toBe('generating');
    readyVerses = [4, 5, 6, 7, 8, 9, 10];
    await waitFor(() => expect(result.current.suggestions[8]).toBe('Draft 8'), { timeout: 7000 });
    expect(result.current.suggestionStatus).toBe('idle');
  }, 10000);

  it('stops new requests while off and resumes for the newly active group', async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(queued).toHaveLength(1));
    await waitFor(() => expect(result.current.suggestions[10]).toBe('Draft 10'));
    const next = {
      verseNumbers: [9, 10],
      nextVerseNumbers: [],
      pericopeNumbers: ['3'],
      titleVerseNumbers: {} as Record<string, number>,
    };
    rerender({ activeVerse: 9, enabled: false, scope: next, unit: 1 });
    expect(result.current.suggestions).toEqual({});
    expect(queued).toHaveLength(1);
    rerender({ activeVerse: 9, enabled: true, scope: next, unit: 1 });
    await waitFor(() => expect(queued.slice(1)).toEqual([['3']]));
    await waitFor(() => expect(result.current.suggestions[9]).toBe('Draft 9'));
  });

  it('does not fetch or queue suggestions in a read-only surface', async () => {
    const { result } = setup(true, false);
    await act(async () => {});
    expect(queued).toEqual([]);
    expect(gets).toBe(0);
    expect(result.current.suggestions).toEqual({});
  });

  it('uses a new cache and queue context for another assignment in the same chapter', async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.suggestions[4]).toBe('Draft 4'));
    await waitFor(() => expect(queued).toHaveLength(1));
    readyVerses = [];
    rerender({ activeVerse: 4, enabled: true, scope: pericope, unit: 2 });
    expect(result.current.suggestions).toEqual({});
    await waitFor(() => expect(queued).toHaveLength(2));
  });

  it('reports fetch failures without injecting a suggestion', async () => {
    server.use(http.get(api, () => new HttpResponse(null, { status: 500 })));
    const { result } = setup();
    await waitFor(() => expect(result.current.suggestionStatus).toBe('error'));
    expect(result.current.suggestions).toEqual({});
  });

  it('does not fetch heading suggestions for groups without titles', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.suggestions[4]).toBe('Draft 4'));
    expect(headingGets).toBe(0);
  });

  it('waits for a late title even after all active verses are ready', async () => {
    const { result, rerender } = setup();
    rerender({
      activeVerse: 4,
      enabled: true,
      scope: { ...pericope, titleVerseNumbers: { '2': 4 } },
      unit: 1,
    });
    await waitFor(() => expect(headingGets).toBeGreaterThan(0));
    expect(result.current.suggestionStatus).toBe('generating');
    headingReady = true;
    await waitFor(
      () => expect(result.current.headingSuggestions['2']?.suggestedText).toBe('A section title'),
      { timeout: 7000 }
    );
    await waitFor(() => expect(result.current.suggestionStatus).toBe('idle'));
  }, 10000);
});
