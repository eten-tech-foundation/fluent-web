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

  it('CR-1 regression: purges a pair that itself contains the "|" delimiter', () => {
    // The pair is the *middle* field; the outer fields (snt_id, ordinal) are
    // pipe-free, so a "|" inside the repeated_word must not break matching.
    // A naive split('|')[1] would read "a " and fail to purge this rule.
    const rules: OccurrenceRules = {
      'JDG 4:3|a | a|0': 'suppress',
      'JDG 4:3|and and|0': 'suppress',
    };
    const { rules: next, changed } = purgeLocalForPair(rules, 'a | a');
    expect(changed).toBe(true);
    expect(next).toEqual({ 'JDG 4:3|and and|0': 'suppress' });
  });

  it('CR-1 regression: handles pairs with other awkward characters (quote, backslash)', () => {
    const rules: OccurrenceRules = {
      'GEN 1:1|a" a"|0': 'suppress',
      'GEN 1:2|b\\ b\\|0': 'surface',
    };
    expect(purgeLocalForPair(rules, 'a" a"').rules).toEqual({ 'GEN 1:2|b\\ b\\|0': 'surface' });
    expect(purgeLocalForPair(rules, 'b\\ b\\').rules).toEqual({ 'GEN 1:1|a" a"|0': 'suppress' });
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

  it('BUG #3 regression: ignoreHere DELETES a "surface" override instead of stacking "suppress"', async () => {
    // Scenario: a legitimate finding was surfaced (undo), then the user clicks
    // Ignore Here again. The 'surface' override should be removed so the finding
    // falls back to the lower-layer verdict (legitimate), not overwritten with
    // 'suppress' which would change the inactiveReason and require two undos.
    const save = vi.fn();
    const { result } = setup({ 'JDG 4:3|the the|0': 'surface' }, save);
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.ignoreHere('JDG 4:3|the the|0'));
    // Should delete the 'surface' key, not write 'suppress' over it.
    expect(save).toHaveBeenCalledWith({});
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

  it('CR-7 regression: a failed global PUT restores the optimistically-purged occurrence rules', async () => {
    // The optimistic global write purges the current-chapter occurrence rules for
    // the pair (a *persisted* write through saveOccurrenceRules). If the PUT then
    // fails, the global flag rolls back — and so must the occurrence map, or the
    // user's per-occurrence ignores for that pair would be permanently lost.
    mockGet({ settings: { checkIgnoredWordPairs: {} }, updatedAt: null });
    mockPut(500);
    const save = vi.fn();
    const original: OccurrenceRules = {
      'JDG 4:3|the the|0': 'suppress',
      'JDG 4:3|and and|0': 'suppress',
    };
    const { result } = setup(original, save);
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.ignoreEverywhere('the the'));

    // First call is the optimistic purge (the "the the" occurrence rule dropped).
    expect(save).toHaveBeenNthCalledWith(1, { 'JDG 4:3|and and|0': 'suppress' });
    // After the PUT 500, the catch restores the full pre-purge occurrence map.
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenNthCalledWith(2, original);
    // Global map also rolled back to its prior (empty) state.
    expect(result.current.globalRules).toEqual({});
  });

  it('NEW-C: rollback merges back only the purged keys, preserving a later unrelated occurrence edit', async () => {
    // Regression for CR thread 3488525698. The old rollback restored the WHOLE
    // call-time occurrence snapshot, which would wipe any occurrence edit the user
    // made while the global PUT was in flight. We now merge back only the keys the
    // optimistic purge removed, into the *current* map — so an unrelated edit that
    // landed in the meantime survives the rollback.
    mockGet({ settings: { checkIgnoredWordPairs: {} }, updatedAt: null });
    mockPut(500);
    const save = vi.fn();
    const original: OccurrenceRules = { 'JDG 4:3|the the|0': 'suppress' };
    const { result, rerender } = setup(original, save);
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    // Global "Ignore Everywhere" for "the the": optimistically purges that key.
    act(() => result.current.ignoreEverywhere('the the'));
    expect(save).toHaveBeenNthCalledWith(1, {});

    // While the PUT is in flight, an unrelated occurrence edit lands (e.g. the
    // user clicks "Ignore Here" on a different finding). Simulate the new map
    // flowing back in through the prop (the single editor-state writer).
    const afterEdit: OccurrenceRules = { 'JDG 4:5|and and|0': 'suppress' };
    rerender({ occurrenceRules: afterEdit, saveOccurrenceRules: save });

    // PUT 500 → rollback merges ONLY the purged "the the" key back into the
    // current map, keeping the unrelated "and and" edit intact (not overwritten
    // by the stale pre-purge snapshot).
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenNthCalledWith(2, {
      'JDG 4:5|and and|0': 'suppress',
      'JDG 4:3|the the|0': 'suppress',
    });
    expect(result.current.globalRules).toEqual({});
  });

  it('single-key full-replace: the PUT body carries only checkIgnoredWordPairs (no client-side sibling echo)', async () => {
    // The blob is single-key today; the client sends only the key it owns and the
    // server full-replaces (the API write schema strips unknown keys, so a second
    // setting cannot exist without a server-schema change that must add server-side
    // merge — see the API implementation note). Even if GET happens to return an
    // unknown sibling, the client must NOT echo it back: it sends only
    // checkIgnoredWordPairs.
    mockGet({
      settings: { checkIgnoredWordPairs: {}, someOtherFeatureSetting: { enabled: true } },
      updatedAt: null,
    });
    const put = mockPut();
    const { result } = setup({}, vi.fn());
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.ignoreEverywhere('the the'));

    await waitFor(() =>
      expect(put.body).toEqual({
        settings: { checkIgnoredWordPairs: { 'the the': 'suppress' } },
      })
    );
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

  it('BUG #4 regression: stopIgnoringEverywhere writes "surface" when no global suppress exists (e.g. legitimate-only finding)', async () => {
    // Scenario: a finding is only suppressed by Greek Room legitimate (no global
    // rule). The chevron "Stop ignoring everywhere" should write a global 'surface'
    // to override the legitimate verdict for this pair across all projects.
    mockGet({ settings: { checkIgnoredWordPairs: {} }, updatedAt: null });
    const put = mockPut();
    const { result } = setup({}, vi.fn());
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.stopIgnoringEverywhere('truly truly'));
    expect(result.current.globalRules).toEqual({ 'truly truly': 'surface' });
    await waitFor(() =>
      expect(put.body).toEqual({
        settings: { checkIgnoredWordPairs: { 'truly truly': 'surface' } },
      })
    );
  });

  it('ignoreEverywhere DELETES a "surface" global override instead of stacking "suppress" (toggle principle)', async () => {
    // Scenario: a pair was previously globally surfaced (e.g. to override
    // legitimate). Clicking "Ignore Everywhere" should just remove the 'surface'
    // override, letting the lower layer (legitimate) re-suppress naturally.
    mockGet({
      settings: { checkIgnoredWordPairs: { 'truly truly': 'surface' } },
      updatedAt: null,
    });
    const put = mockPut();
    const { result } = setup({}, vi.fn());
    await waitFor(() => expect(result.current.globalRules).toEqual({ 'truly truly': 'surface' }));

    act(() => result.current.ignoreEverywhere('truly truly'));
    expect(result.current.globalRules).toEqual({});
    await waitFor(() =>
      expect(put.body).toEqual({
        settings: { checkIgnoredWordPairs: {} },
      })
    );
  });

  it('stopIgnoringEverywhere rolls back on PUT failure', async () => {
    mockGet({
      settings: { checkIgnoredWordPairs: { 'the the': 'suppress' } },
      updatedAt: null,
    });
    mockPut(500);
    const { result } = setup({}, vi.fn());
    await waitFor(() => expect(result.current.globalRules).toEqual({ 'the the': 'suppress' }));

    act(() => result.current.stopIgnoringEverywhere('the the'));
    // Optimistically removed, then rolls back on 500.
    await waitFor(() => expect(result.current.globalRules).toEqual({ 'the the': 'suppress' }));
  });

  it('CR-1 regression: ignoreEverywhere purges a current-chapter rule whose pair contains "|"', async () => {
    // End-to-end through the real purge path (purgeCurrentChapter → purgeLocalForPair).
    // The occurrence key for a pipe-containing pair must still be purged on a
    // global "Ignore Everywhere"; otherwise the just-clicked panel keeps a stale
    // occurrence rule (occurrence beats global) for that pair.
    mockGet({ settings: { checkIgnoredWordPairs: {} }, updatedAt: null });
    mockPut();
    const save = vi.fn();
    const { result } = setup(
      { 'JDG 4:3|a | a|0': 'suppress', 'JDG 4:3|and and|0': 'suppress' },
      save
    );
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    act(() => result.current.ignoreEverywhere('a | a'));
    // Only the pipe-containing rule is purged; the unrelated one stands.
    expect(save).toHaveBeenCalledWith({ 'JDG 4:3|and and|0': 'suppress' });
  });

  it('CR-15 follow-up: serializes overlapping global writes so PUTs reach the server in UI-action order', async () => {
    // Two quick global toggles must not race on the server. Each full-replace PUT
    // is chained after the previous one settles, so the second PUT does not even
    // start until the first has finished — guaranteeing the persisted blob ends in
    // the same order as the user actions (an older PUT can't land after a newer
    // one). We prove this by making the FIRST PUT hang until we release it: while
    // it is in flight the second PUT must NOT have started; after release, both
    // arrive in order.
    mockGet({ settings: { checkIgnoredWordPairs: {} }, updatedAt: null });

    const order: Array<Record<string, unknown>> = [];
    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    let putCount = 0;
    server.use(
      http.put(SETTINGS_URL, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        putCount += 1;
        if (putCount === 1) {
          // Hold the first write open until the test releases it.
          await firstReleased;
        }
        order.push(body);
        return HttpResponse.json({ settings: {}, updatedAt: null }, { status: 200 });
      })
    );

    const { result } = setup({}, vi.fn());
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    // First global toggle — its PUT starts and hangs (held open above).
    act(() => result.current.ignoreEverywhere('aaa'));
    await waitFor(() => expect(putCount).toBe(1));

    // Second global toggle while the first PUT is still in flight. Its PUT is
    // chained behind the first and must NOT have started yet (serialized — not
    // fired concurrently). The optimistic state already reflects both.
    act(() => result.current.ignoreEverywhere('bbb'));
    expect(result.current.globalRules).toEqual({ aaa: 'suppress', bbb: 'suppress' });
    // Still only one PUT in flight; the second is queued behind it.
    expect(putCount).toBe(1);
    expect(order).toHaveLength(0); // first hasn't completed, second hasn't started

    // Release the first; now the second proceeds. Both complete in order A→B.
    releaseFirst();
    await waitFor(() => expect(order).toHaveLength(2));
    expect(order[0]).toEqual({ settings: { checkIgnoredWordPairs: { aaa: 'suppress' } } });
    // Second carries BOTH toggles (state accumulated), proving B persisted last.
    expect(order[1]).toEqual({
      settings: { checkIgnoredWordPairs: { aaa: 'suppress', bbb: 'suppress' } },
    });
  });

  it('NEW-C: a queued write rolls back to the last COMMITTED baseline, not a call-time snapshot holding an earlier unconfirmed write', async () => {
    // Regression for CR thread 3488525698 (the half our serialization surfaced).
    // Writes are serialized: A then B. B is issued while A is still optimistic but
    // unconfirmed, so B's call-time `previous` already contains A's change. If A
    // FAILS and B also FAILS, the seq-guard lets B (the latest) roll back. Rolling
    // back to B's call-time snapshot would resurrect A's never-persisted state;
    // we instead roll back to the last *server-confirmed* baseline (here: empty).
    mockGet({ settings: { checkIgnoredWordPairs: {} }, updatedAt: null });

    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });
    let putCount = 0;
    server.use(
      http.put(SETTINGS_URL, async () => {
        putCount += 1;
        if (putCount === 1) {
          await firstReleased;
        }
        // Both writes fail — neither ever commits, so the confirmed baseline stays empty.
        return HttpResponse.json({ message: 'boom' }, { status: 500 });
      })
    );

    const { result } = setup({}, vi.fn());
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    // Write A: optimistic {aaa}; its PUT starts and hangs (held open).
    act(() => result.current.ignoreEverywhere('aaa'));
    await waitFor(() => expect(putCount).toBe(1));

    // Write B while A is unconfirmed: B's call-time `previous` is {aaa} (A's
    // optimistic state). Optimistic now shows both.
    act(() => result.current.ignoreEverywhere('bbb'));
    expect(result.current.globalRules).toEqual({ aaa: 'suppress', bbb: 'suppress' });

    // Release A (fails), then B runs (also fails). Only B rolls back (latest seq).
    releaseFirst();
    await waitFor(() => expect(putCount).toBe(2));

    // B rolls back to the last COMMITTED baseline (empty), NOT to {aaa} — A's
    // change was never persisted, so it must not survive as a phantom.
    await waitFor(() => expect(result.current.globalRules).toEqual({}));
  });

  it('purge-local runs for NFC-composed vs decomposed pair in occurrence key', async () => {
    // The occurrence key stores the NFC-normalized pair; global write purges by
    // normalizing the repeated_word. Composed "caf\u00e9" must purge a key that
    // stores the decomposed form "cafe\u0301" (or vice versa).
    mockGet({ settings: { checkIgnoredWordPairs: {} }, updatedAt: null });
    mockPut();
    const save = vi.fn();
    const decomposedKey = 'GEN 1:1|cafe\u0301 cafe\u0301|0';
    const { result } = setup({ [decomposedKey]: 'suppress' }, save);
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    // ignoreEverywhere with the composed form — should purge the decomposed occurrence rule.
    act(() => result.current.ignoreEverywhere('caf\u00e9 caf\u00e9'));
    // The save callback should have been called with an empty map (decomposed key purged).
    expect(save).toHaveBeenCalledWith({});
  });
});

// ---------------------------------------------------------------------------
// Occurrence rules propagation
// ---------------------------------------------------------------------------

describe('useSuppressions — occurrence rules propagation', () => {
  it('passes through the injected occurrenceRules unchanged in the returned value', async () => {
    const rules: OccurrenceRules = {
      'JDG 4:3|the the|0': 'suppress',
      'JDG 4:5|and and|0': 'surface',
    };
    const { result } = setup(rules, vi.fn());
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));
    expect(result.current.occurrenceRules).toEqual(rules);
  });

  it('updates the occurrenceRules reference when the prop changes (via rerender)', async () => {
    const save = vi.fn();
    const { result, rerender } = setup({}, save);
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));

    const newRules: OccurrenceRules = { 'JDG 4:1|the the|0': 'suppress' };
    rerender({ occurrenceRules: newRules, saveOccurrenceRules: save });
    expect(result.current.occurrenceRules).toEqual(newRules);
  });
});

// ---------------------------------------------------------------------------
// settingsProbeResolved timing
// ---------------------------------------------------------------------------

describe('useSuppressions — settingsProbeResolved gates the check query', () => {
  it('starts false before the probe returns', () => {
    // The beforeEach sets up a default GET handler; the probe resolves
    // asynchronously, so at the very start it must be false.
    const { result } = setup();
    expect(result.current.settingsProbeResolved).toBe(false);
  });

  it('becomes true after a 200 response', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));
  });

  it('becomes true even after a 404 (unavailable but resolved)', async () => {
    mockGet({ message: 'Not Found' }, 404);
    const { result } = setup();
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));
    expect(result.current.globalIgnoresAvailable).toBe(false);
  });

  it('becomes true even after a non-404 server error (conservatively unavailable)', async () => {
    mockGet({}, 503);
    const { result } = setup();
    await waitFor(() => expect(result.current.settingsProbeResolved).toBe(true));
    expect(result.current.globalIgnoresAvailable).toBe(false);
  });
});
