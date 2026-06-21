import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { act, renderHook, waitFor } from '@/test/render';

import { type OccurrenceRules, type ResolvedFinding } from '../checks.types';

import {
  deleteRule,
  purgeLocalForPair,
  setRule,
  useSuppressions,
  type UseSuppressionsParams,
} from './useSuppressions';

const SETTINGS_URL = `${config.api.url}/self/settings`;

/** Register a GET /self/settings handler returning the given body + status. */
const mockGet = (body: Record<string, unknown>, status = 200) => {
  server.use(http.get(SETTINGS_URL, () => HttpResponse.json(body, { status })));
};

/** Register a PUT /self/settings handler; resolves the captured body. */
const mockPut = (status = 200) => {
  const captured: { body: unknown } = { body: undefined };
  server.use(
    http.put(SETTINGS_URL, async ({ request }) => {
      captured.body = await request.json();
      return HttpResponse.json({ settings: {}, updatedAt: null }, { status });
    })
  );
  return captured;
};

/** Render the hook with an injected occurrence store we can assert against. */
const setup = (
  occurrenceRules: OccurrenceRules = {},
  saveOccurrenceRules: UseSuppressionsParams['saveOccurrenceRules'] = vi.fn()
) => {
  const result = renderHook((props: UseSuppressionsParams) => useSuppressions(props), {
    initialProps: { occurrenceRules, saveOccurrenceRules },
  });
  return { ...result, saveOccurrenceRules };
};

const makeResolved = (over: Partial<ResolvedFinding> = {}): ResolvedFinding => ({
  finding: {
    snt_id: 'JDG 4:3',
    repeated_word: 'the the',
    surf: 'the the',
    start_position: 0,
    legitimate: false,
    severity: 0.5,
  },
  ordinal: 0,
  occurrenceKey: 'JDG 4:3|the the|0',
  isActive: false,
  inactiveReason: 'occurrence',
  ...over,
});

beforeEach(() => {
  // Default: route present, empty settings, so probe resolves "available".
  mockGet({ settings: null, updatedAt: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('setRule / deleteRule', () => {
  it('setRule returns a new map with the key set, leaving the original untouched', () => {
    const original: OccurrenceRules = { a: 'suppress' };
    const next = setRule(original, 'b', 'surface');
    expect(next).toEqual({ a: 'suppress', b: 'surface' });
    expect(original).toEqual({ a: 'suppress' });
  });

  it('deleteRule removes the key in a copy; no-op when absent', () => {
    expect(deleteRule({ a: 'suppress', b: 'surface' }, 'a')).toEqual({ b: 'surface' });
    expect(deleteRule({ a: 'suppress' }, 'missing')).toEqual({ a: 'suppress' });
  });
});

describe('purgeLocalForPair', () => {
  it('drops every occurrence rule whose pair segment matches (NFC), keeps others', () => {
    const rules: OccurrenceRules = {
      'JDG 4:3|the the|0': 'suppress',
      'JDG 4:5|the the|0': 'surface',
      'JDG 4:3|and and|0': 'suppress',
    };
    const { rules: next, changed } = purgeLocalForPair(rules, 'the the');
    expect(changed).toBe(true);
    expect(next).toEqual({ 'JDG 4:3|and and|0': 'suppress' });
  });

  it('matches composed vs decomposed accents', () => {
    const rules: OccurrenceRules = { ['GEN 1:1|cafe\u0301 cafe\u0301|0']: 'suppress' };
    const { rules: next, changed } = purgeLocalForPair(rules, 'caf\u00e9 caf\u00e9');
    expect(changed).toBe(true);
    expect(next).toEqual({});
  });

  it('returns the same instance + changed=false when nothing matches', () => {
    const rules: OccurrenceRules = { 'JDG 4:3|and and|0': 'suppress' };
    const out = purgeLocalForPair(rules, 'the the');
    expect(out.changed).toBe(false);
    expect(out.rules).toBe(rules);
  });
});

// ---------------------------------------------------------------------------
// Feature-detect probe (§9.1, W8)
// ---------------------------------------------------------------------------

describe('useSuppressions — feature-detect probe', () => {
  it('200 with settings:null ⇒ available, empty global rules, probe resolved', async () => {
    mockGet({ settings: null, updatedAt: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));
    expect(result.current.globalIgnoresAvailable).toBe(true);
    expect(result.current.globalRules).toEqual({});
  });

  it('200 with rules ⇒ available and parses checkIgnoredWordPairs', async () => {
    mockGet({
      settings: { checkIgnoredWordPairs: { 'the the': 'suppress' } },
      updatedAt: '2026-06-18T00:00:00Z',
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));
    expect(result.current.globalIgnoresAvailable).toBe(true);
    expect(result.current.globalRules).toEqual({ 'the the': 'suppress' });
  });

  it('404 ⇒ unavailable (route not deployed), probe still resolves', async () => {
    mockGet({ message: 'Not Found' }, 404);
    const { result } = setup();
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));
    expect(result.current.globalIgnoresAvailable).toBe(false);
    expect(result.current.globalRules).toEqual({});
  });

  it('network failure ⇒ conservatively unavailable, probe resolves', async () => {
    server.use(http.get(SETTINGS_URL, () => HttpResponse.error()));
    const { result } = setup();
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));
    expect(result.current.globalIgnoresAvailable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Occurrence actions (write through the single editor-state writer, §7.1)
// ---------------------------------------------------------------------------

describe('useSuppressions — occurrence actions', () => {
  it('ignoreHere writes a "suppress" verdict for the key, preserving siblings', async () => {
    const save = vi.fn();
    const { result } = setup({ 'JDG 4:3|and and|0': 'suppress' }, save);
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.ignoreHere('JDG 4:3|the the|0'));
    expect(save).toHaveBeenCalledWith({
      'JDG 4:3|and and|0': 'suppress',
      'JDG 4:3|the the|0': 'suppress',
    });
  });

  it('undoOccurrence DELETES the rule when the finding is hidden by its own occurrence rule', async () => {
    const save = vi.fn();
    const { result } = setup({ 'JDG 4:3|the the|0': 'suppress' }, save);
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.undoOccurrence(makeResolved({ inactiveReason: 'occurrence' })));
    expect(save).toHaveBeenCalledWith({});
  });

  it('undoOccurrence writes "surface" when the finding is hidden by a GLOBAL rule', async () => {
    const save = vi.fn();
    const { result } = setup({}, save);
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.undoOccurrence(makeResolved({ inactiveReason: 'global' })));
    expect(save).toHaveBeenCalledWith({ 'JDG 4:3|the the|0': 'surface' });
  });

  it('undoOccurrence writes "surface" when the finding is hidden by Greek Room (legitimate)', async () => {
    const save = vi.fn();
    const { result } = setup({}, save);
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.undoOccurrence(makeResolved({ inactiveReason: 'legitimate' })));
    expect(save).toHaveBeenCalledWith({ 'JDG 4:3|the the|0': 'surface' });
  });
});

// ---------------------------------------------------------------------------
// Global actions (optimistic + rollback; purge current-chapter local, §6.5/§9.3)
// ---------------------------------------------------------------------------

describe('useSuppressions — global actions', () => {
  it('ignoreEverywhere optimistically suppresses, PUTs the full blob, and purges current-chapter occurrence rules for the pair', async () => {
    mockGet({ settings: { checkIgnoredWordPairs: {} }, updatedAt: null });
    const put = mockPut();
    const save = vi.fn();
    const { result } = setup(
      { 'JDG 4:3|the the|0': 'suppress', 'JDG 4:3|and and|0': 'suppress' },
      save
    );
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.ignoreEverywhere('the the'));

    // Optimistic: the global map updates immediately.
    expect(result.current.globalRules).toEqual({ 'the the': 'suppress' });
    // Purge-local: the current-chapter occurrence rule for "the the" is dropped,
    // the unrelated "and and" rule stands.
    expect(save).toHaveBeenCalledWith({ 'JDG 4:3|and and|0': 'suppress' });
    // Full-replace PUT carries the whole blob under settings.checkIgnoredWordPairs.
    await waitFor(() =>
      expect(put.body).toEqual({ settings: { checkIgnoredWordPairs: { 'the the': 'suppress' } } })
    );
  });

  it('ignoreEverywhere rolls back the optimistic update on PUT failure', async () => {
    mockGet({ settings: { checkIgnoredWordPairs: {} }, updatedAt: null });
    mockPut(500);
    const { result } = setup({}, vi.fn());
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.ignoreEverywhere('the the'));
    // Briefly optimistic, then reverts to the prior (empty) state.
    await waitFor(() => expect(result.current.globalRules).toEqual({}));
  });

  it('stopIgnoringEverywhere deletes the global entry and PUTs the reduced blob', async () => {
    mockGet({
      settings: { checkIgnoredWordPairs: { 'the the': 'suppress', 'and and': 'suppress' } },
      updatedAt: null,
    });
    const put = mockPut();
    const { result } = setup({}, vi.fn());
    await waitFor(() =>
      expect(result.current.globalRules).toEqual({ 'the the': 'suppress', 'and and': 'suppress' })
    );

    act(() => result.current.stopIgnoringEverywhere('the the'));
    expect(result.current.globalRules).toEqual({ 'and and': 'suppress' });
    await waitFor(() =>
      expect(put.body).toEqual({
        settings: { checkIgnoredWordPairs: { 'and and': 'suppress' } },
      })
    );
  });
});
