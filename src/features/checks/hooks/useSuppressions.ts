import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

import {
  type GlobalRules,
  type OccurrenceRules,
  type ResolvedFinding,
  type RuleVerdict,
} from '../checks.types';

import { normalizePair } from './useResolvedFindings';

/**
 * `useSuppressions` — owns the read/write of the two suppression stores that
 * feed the cascade in `useResolvedFindings` (Repeated Word Check, phase 2;
 * proposal §6.5, §7, §9.1, §9.3, W6/W8).
 *
 * Two stores, two scopes:
 *
 *  - **Occurrence rules** (cascade layer 2) live in the editor-state JSONB blob
 *    (`checkOccurrenceRules`), scoped to one `(user, chapterAssignment)`. There
 *    is **one writer** for that blob — `useResourceStatePersistence`'s save
 *    mutation — so this hook does not open a second PUT path. The page injects
 *    the current map plus a single `saveOccurrenceRules` callback; this hook
 *    does the read-modify-write and hands the merged map back through it (§7.1,
 *    "one writer for the editor-state blob").
 *
 *  - **Global word-pair rules** (cascade layer 1) live in
 *    `user_settings.checkIgnoredWordPairs` behind `GET/PUT /self/settings`. This
 *    hook owns that half end to end: the once-per-session feature-detect probe
 *    (§9.1), optimistic writes with rollback (§9.3), and the full-replace PUT
 *    (§8.1).
 *
 * The action callbacks (`ignoreHere`, `ignoreEverywhere`, `undoOccurrence`,
 * `stopIgnoringEverywhere`) are what `FindingRow` (phase 3) calls. The confirm
 * dialog for "Ignore Everywhere" lives in the UI (phase 3); it calls
 * `ignoreEverywhere` only on confirm.
 */

// ---------------------------------------------------------------------------
// /self/settings wire shape (Fluent-domain → camelCase, conventions §B).
// ---------------------------------------------------------------------------

/**
 * The user-settings blob behind `/self/settings`. Tolerant of absent keys.
 *
 * Single-key today: `checkIgnoredWordPairs` is the only setting in the blob, so
 * the PUT is a full-replace of the whole JSONB blob (§8.1; the API `upsert`
 * replaces `settings` wholesale with no server-side merge) and the client simply
 * sends the one key it owns. The API write schema strips unknown keys, so a
 * second setting cannot be introduced without editing the server schema — at
 * which point the server is responsible for read-merging keys (the API carries an
 * implementation note gating that). We therefore deliberately do NOT cache/echo a
 * client-side snapshot of sibling keys here. This stays on the camelCase
 * `/self/settings` boundary, NOT the snake_case greek-room pass-through (see
 * checks.types.ts:1-19).
 */
interface SelfSettings {
  /** Global word-pair rules, keyed by NFC-normalized `repeated_word`. */
  checkIgnoredWordPairs?: GlobalRules;
}

/**
 * GET response shape. The API returns `{ settings, updatedAt }` (see
 * fluent-api `self-settings.service.ts` `toResponse`), where `settings` is
 * `null` when the user has no row yet (W8). The client only reads `settings`
 * — `updatedAt` is modeled here for contract fidelity (the doc §8.1 lists it)
 * but is deliberately ignored: there is no optimistic-concurrency / ETag path
 * in v1 (§8.3), so the timestamp has no consumer. Kept optional so an older
 * deployment that omits it still parses.
 */
interface SelfSettingsResponse {
  settings: SelfSettings | null;
  /** Server-side last-write timestamp (ISO string) or `null`. Unused by the
   * client today; present only to match the wire contract. */
  updatedAt?: string | null;
}

const SELF_SETTINGS_URL = `${config.api.url}/self/settings`;

/**
 * Result of the once-per-session probe. `available` distinguishes "the route
 * exists" (any 2xx, including `settings: null`) from "not deployed / network
 * down" (404 or failure) so phase 3 can hide the global-ignore controls
 * without ever rendering a dead button (W8).
 */
interface ProbeResult {
  available: boolean;
  rules: GlobalRules;
}

/** Pull the global rules out of a settings blob, tolerating any odd shape. */
const extractGlobalRules = (settings: SelfSettings | null): GlobalRules => {
  const pairs = settings?.checkIgnoredWordPairs;
  if (pairs && typeof pairs === 'object') {
    return pairs as GlobalRules;
  }
  return {};
};

/**
 * Probe `GET /self/settings` once. Any 2xx ⇒ available (parse rules, tolerate
 * `null`); 404 ⇒ route not deployed yet ⇒ unavailable; network/parse failure ⇒
 * conservatively unavailable for the session. Never throws.
 */
const probeSelfSettings = async (): Promise<ProbeResult> => {
  try {
    const res = await fetch(SELF_SETTINGS_URL, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.status === 404) {
      return { available: false, rules: {} };
    }
    if (!res.ok) {
      // Other non-2xx (401/500/…): treat as unavailable for the session.
      return { available: false, rules: {} };
    }
    const body = (await res.json()) as SelfSettingsResponse | null;
    const settings = body?.settings ?? null;
    return {
      available: true,
      rules: extractGlobalRules(settings),
    };
  } catch (error) {
    Logger.logException(error, { context: 'Repeated-words self/settings probe failed' });
    return { available: false, rules: {} };
  }
};

/**
 * PUT the settings blob (full-replace, §8.1). The blob is single-key today
 * (`checkIgnoredWordPairs`), so the caller supplies the complete map it wants
 * persisted and we send the whole blob. A second setting cannot exist without a
 * server-schema change, at which point the server merges keys (it carries an
 * implementation note gating that) — so we deliberately send only the key we own
 * and do NOT echo a client-cached snapshot.
 */
const putSelfSettings = async (rules: GlobalRules): Promise<void> => {
  const res = await fetch(SELF_SETTINGS_URL, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: { checkIgnoredWordPairs: rules } }),
  });
  if (!res.ok) {
    throw new Error('Failed to save global ignore rules');
  }
};

// ---------------------------------------------------------------------------
// Pure map helpers (exported for unit tests).
// ---------------------------------------------------------------------------

/** Set `key → verdict` in a copy of `rules`. */
export const setRule = <T extends Record<string, RuleVerdict>>(
  rules: T,
  key: string,
  verdict: RuleVerdict
): T => ({ ...rules, [key]: verdict });

/** Delete `key` from a copy of `rules` (no-op if absent). */
export const deleteRule = <T extends Record<string, RuleVerdict>>(rules: T, key: string): T => {
  if (!(key in rules)) {
    return { ...rules };
  }
  const next = { ...rules };
  delete next[key];
  return next;
};

/**
 * Extract the `repeated_word` segment from an occurrence key
 * (`"{snt_id}|{repeated_word}|{ordinal}"`).
 *
 * We deliberately do **not** `split('|')`: the `repeated_word` is the *middle*
 * field, and while `snt_id` (`"{bookCode} {chapter}:{verse}"`) and `ordinal` (a
 * number) provably contain no `|`, the pair itself is verse-derived text and is
 * not guaranteed to be pipe-free. A naive `split('|')[1]` would mis-slice such a
 * pair (e.g. a key `"JDG 4:3|a | a|0"` would yield `"a "` instead of `"a | a"`)
 * and silently fail to purge that rule. Because the two *outer* fields are
 * pipe-free, the pair is exactly the substring between the first and last `|`,
 * which we recover unambiguously regardless of any `|` inside it. Returns
 * `undefined` for a malformed key (fewer than two delimiters).
 */
const extractPairFromKey = (key: string): string | undefined => {
  const first = key.indexOf('|');
  const last = key.lastIndexOf('|');
  if (first === -1 || last === first) {
    return undefined;
  }
  return key.slice(first + 1, last);
};

/**
 * Remove every occurrence rule that targets `repeatedWord` (NFC-normalized) in
 * the current chapter's occurrence map — used by "purge-local on global write"
 * (§6.5). The occurrence key is `"{snt_id}|{repeated_word}|{ordinal}"`, so we
 * match the normalized middle segment (see {@link extractPairFromKey} for why we
 * slice between the outer delimiters rather than `split('|')`). Returns a new map
 * (or the same instance if nothing matched, to avoid needless writes).
 */
export const purgeLocalForPair = (
  occurrenceRules: OccurrenceRules,
  repeatedWord: string
): { rules: OccurrenceRules; changed: boolean } => {
  const target = normalizePair(repeatedWord);
  let changed = false;
  const next: OccurrenceRules = {};
  for (const [key, verdict] of Object.entries(occurrenceRules)) {
    const pair = extractPairFromKey(key);
    if (pair !== undefined && normalizePair(pair) === target) {
      changed = true;
      continue; // drop it
    }
    next[key] = verdict;
  }
  return changed ? { rules: next, changed } : { rules: occurrenceRules, changed };
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseSuppressionsParams {
  /**
   * Current occurrence-rule map from the editor-state blob (read through the
   * single editor-state writer; defaults to empty for old rows). The page owns
   * this state; this hook never fetches it.
   */
  occurrenceRules: OccurrenceRules;
  /**
   * The **single writer** for the occurrence map. Given the next full map, it
   * persists it via the existing debounced editor-state save
   * (`useResourceStatePersistence`). This hook does the read-modify-write and
   * never opens its own editor-state PUT (the "one writer" rule, §7.1).
   */
  saveOccurrenceRules: (next: OccurrenceRules) => void;
  /**
   * Whether the Repeated Word Check feature is enabled in this environment
   * (the `repeatedWordCheck` flag; feature-flags proposal D5/D7). Defaults to
   * `true` so existing callers/tests are unaffected. When `false`, the
   * once-per-session `GET /self/settings` probe is **skipped entirely** — the
   * whole Checks UI is hidden behind the flag, so there is no reason to fetch
   * user settings for a feature that can't be seen (W2). The global stores stay
   * at their fail-closed defaults (empty rules, `globalIgnoresAvailable=false`)
   * and `settingsProbeResolved` stays `false`, which is consistent with the
   * check query being suppressed by the same flag upstream.
   */
  enabled?: boolean;
}

export interface UseSuppressionsResult {
  /** Layer-2 map → `useResolvedFindings`. */
  occurrenceRules: OccurrenceRules;
  /** Layer-1 map → `useResolvedFindings`. */
  globalRules: GlobalRules;
  /** False until the probe resolves, and on 404/failure (W8). Phase 3 hides
   * `[Ignore Everywhere]` and omits global undo when this is false. */
  globalIgnoresAvailable: boolean;
  /** Flips true on any terminal probe response. Phase 4 gates the check
   * query's `enabled` on this so findings never render ahead of global rules
   * (W10/§9.1). */
  settingsProbeResolved: boolean;

  // Actions called by FindingRow (phase 3) -----------------------------------

  /** "Ignore Here" — suppress this single occurrence (layer 2). */
  ignoreHere: (occurrenceKey: string) => void;
  /** "Ignore Everywhere" — suppress this word pair across the user's projects
   * (layer 1) and purge any current-chapter occurrence rules for the pair.
   * Optimistic; rolls back on PUT failure. Caller (phase 3) shows the confirm
   * dialog first. */
  ignoreEverywhere: (repeatedWord: string) => void;
  /** Default `[Undo ▾]` click (§6.5): undo whatever layer is currently hiding
   * this finding — delete the occurrence rule if it's the user's own, else
   * write an occurrence-level `'surface'` override so the global rule / Greek
   * Room verdict survives but this one occurrence re-surfaces. */
  undoOccurrence: (resolved: ResolvedFinding) => void;
  /** Chevron action: stop ignoring this pair everywhere. If a global
   * `'suppress'` exists, deletes it; otherwise writes a global `'surface'`
   * override (e.g. to override Greek Room `legitimate` for the pair globally).
   * Purges current-chapter occurrence rules for the pair. Optimistic; rolls
   * back on PUT failure. */
  stopIgnoringEverywhere: (repeatedWord: string) => void;
}

/**
 * @see the module doc above. The occurrence half is injected (single writer);
 * the global half is owned here (probe + optimistic PUT/rollback).
 */
export const useSuppressions = ({
  occurrenceRules,
  saveOccurrenceRules,
  enabled = true,
}: UseSuppressionsParams): UseSuppressionsResult => {
  // --- Global half: probe once per session, then hold the map locally so we
  // can apply optimistic updates and roll them back without a query refetch. ---
  const [globalRules, setGlobalRules] = useState<GlobalRules>({});
  const [globalIgnoresAvailable, setGlobalIgnoresAvailable] = useState(false);
  const [settingsProbeResolved, setSettingsProbeResolved] = useState(false);

  // Guard against double-invocation (StrictMode) and state updates after
  // unmount; the probe runs exactly once per mounted session.
  const probeStarted = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Last global-rules map the server has *confirmed* (probe result, then each
  // successful PUT). Rollback restores from THIS, never from a call-time
  // snapshot: with writes serialized (see `putChainRef`), a later write B can be
  // issued while an earlier write A is still optimistic-but-unconfirmed, so B's
  // call-time `previous` may contain A's never-persisted change. Reverting to the
  // last *committed* baseline can't resurrect that phantom state (CR `3488525698`).
  // Only ever written in the success path; only ever read in the catch.
  const committedGlobalRef = useRef<GlobalRules>({});

  useEffect(() => {
    // Skip the probe entirely while the feature is off (W2): the Checks UI is
    // hidden behind the flag, so fetching `/self/settings` for it would be a
    // wasted request in every environment where fluent-ai isn't wired. The
    // probe fires once if/when `enabled` becomes true (e.g. the flag resolves
    // after mount), guarded by `probeStarted` so it still runs at most once.
    if (!enabled || probeStarted.current) {
      return;
    }
    probeStarted.current = true;
    void probeSelfSettings().then(({ available, rules }) => {
      if (!mounted.current) {
        return;
      }
      setGlobalIgnoresAvailable(available);
      setGlobalRules(available ? rules : {});
      committedGlobalRef.current = available ? rules : {};
      setSettingsProbeResolved(true);
    });
  }, [enabled]);

  // Latest occurrence map for read-modify-write inside callbacks without
  // making the callbacks change identity on every keystroke.
  const occurrenceRef = useRef(occurrenceRules);
  occurrenceRef.current = occurrenceRules;

  // Monotonic counter identifying the most-recently-issued global write. Each
  // `writeGlobal` captures its own `mySeq`; a failed PUT only rolls back when its
  // `mySeq` is still the latest issued write, so an old failing PUT can't clobber
  // a newer in-flight edit's optimistic state (CR-15; successor to CR-7).
  const writeSeqRef = useRef(0);

  // Tail of the global-write chain. Each PUT is appended after the previous one
  // settles, so the full-replace PUTs reach the server strictly in UI-action
  // order — an older successful write can no longer commit after a newer one.
  // (The `/self/settings` blob is last-writer-wins with no server merge, §8.1, so
  // out-of-order delivery of two overlapping PUTs would otherwise persist the
  // stale blob even though the UI shows the newer edit.) The seq-guard above
  // protects the client rollback; this chain protects the server write order.
  // CR-15 follow-up.
  const putChainRef = useRef<Promise<unknown>>(Promise.resolve());

  // --- Occurrence actions (write through the single editor-state writer) ---

  const ignoreHere = useCallback(
    (occurrenceKey: string) => {
      const currentVerdict = occurrenceRef.current[occurrenceKey] as RuleVerdict | undefined;
      if (currentVerdict === 'surface') {
        // The finding is only active because of a 'surface' override (e.g. the
        // user previously undid a legitimate or global suppression). To re-ignore,
        // just remove the override — the lower layer will re-suppress naturally.
        // This avoids stacking 'suppress' over 'surface' (BUG #3).
        saveOccurrenceRules(deleteRule(occurrenceRef.current, occurrenceKey));
      } else {
        saveOccurrenceRules(setRule(occurrenceRef.current, occurrenceKey, 'suppress'));
      }
    },
    [saveOccurrenceRules]
  );

  const undoOccurrence = useCallback(
    (resolved: ResolvedFinding) => {
      const { occurrenceKey, inactiveReason } = resolved;
      if (inactiveReason === 'occurrence') {
        // The user's own occurrence rule is what's hiding it → remove it.
        saveOccurrenceRules(deleteRule(occurrenceRef.current, occurrenceKey));
      } else {
        // A global rule or Greek Room `legitimate` is hiding it → re-surface
        // just this occurrence; the broader verdict stands.
        saveOccurrenceRules(setRule(occurrenceRef.current, occurrenceKey, 'surface'));
      }
    },
    [saveOccurrenceRules]
  );

  // --- Global actions (optimistic + rollback; purge current-chapter local) ---

  /**
   * Apply a current-chapter purge for `pair` through the single writer. Returns
   * the occurrence entries it removed (key → verdict) so a failed global write
   * can restore *just those* keys — see the rollback in `writeGlobal`. Empty
   * when nothing matched (no write issued).
   */
  const purgeCurrentChapter = useCallback(
    (repeatedWord: string): OccurrenceRules => {
      const before = occurrenceRef.current;
      const { rules, changed } = purgeLocalForPair(before, repeatedWord);
      if (!changed) {
        return {};
      }
      const purged: OccurrenceRules = {};
      for (const [key, verdict] of Object.entries(before)) {
        if (!(key in rules)) {
          purged[key] = verdict;
        }
      }
      saveOccurrenceRules(rules);
      return purged;
    },
    [saveOccurrenceRules]
  );

  const writeGlobal = useCallback(
    (repeatedWord: string, mutate: (rules: GlobalRules) => GlobalRules) => {
      const pair = normalizePair(repeatedWord);
      const previous = globalRules;
      // Mark this as the latest issued write. On failure we only roll back if no
      // newer write was issued in the meantime (CR-15 sequence guard).
      const mySeq = ++writeSeqRef.current;
      const next = mutate(previous);
      // Optimistic: the finding greys/un-greys immediately.
      setGlobalRules(next);
      // Purge current-chapter occurrence rules for the pair so the just-clicked
      // panel doesn't appear to ignore the action (occurrence beats global). Keep
      // exactly which entries were removed so a failed PUT restores only those.
      const purgedOccurrence = purgeCurrentChapter(pair);
      // Send the full blob (single-key full-replace, §8.1), chained after the
      // previous global write so the PUTs commit on the server in UI-action
      // order. The leading `.catch(() => {})` swallows the *previous* link's
      // rejection so one failed write doesn't break the chain for later ones;
      // each write still reports its own failure in the trailing `.catch`.
      putChainRef.current = putChainRef.current
        .catch(() => {})
        .then(async () => {
          await putSelfSettings(next);
          // Persisted: this map is now the confirmed baseline future rollbacks
          // restore from. (Only the success path writes this ref.)
          committedGlobalRef.current = next;
        })
        .catch(error => {
          Logger.logException(error, {
            context: 'Repeated-words global ignore write failed; rolling back',
          });
          // Only the latest issued write may revert its own optimistic changes.
          // If a newer edit was issued while this PUT was in flight, rolling back
          // would clobber that newer edit (CR-15), so we skip and let the newer
          // write own the state.
          if (mounted.current && mySeq === writeSeqRef.current) {
            // Roll the global flag back to the last *server-confirmed* state —
            // NOT the call-time `previous`, which (with serialized writes) could
            // still hold an earlier write's never-persisted optimistic change
            // (CR `3488525698`). Re-click allowed; the visible flip is the only
            // failure notice (no queued retry for v1).
            setGlobalRules(committedGlobalRef.current);
            // Restore only the occurrence entries this write's purge removed,
            // merging them back into the *current* map so unrelated occurrence
            // edits made meanwhile survive (CR `3488525698`). Skip the write
            // entirely when nothing was purged.
            const purgedKeys = Object.keys(purgedOccurrence);
            if (purgedKeys.length > 0) {
              saveOccurrenceRules({ ...occurrenceRef.current, ...purgedOccurrence });
            }
          }
        });
    },
    [globalRules, purgeCurrentChapter, saveOccurrenceRules]
  );

  const ignoreEverywhere = useCallback(
    (repeatedWord: string) => {
      const pair = normalizePair(repeatedWord);
      writeGlobal(repeatedWord, rules => {
        const current = rules[pair] as RuleVerdict | undefined;
        // Toggle principle: if there's a 'surface' override, just remove it
        // (the lower layer or default will re-suppress). Otherwise write 'suppress'.
        return current === 'surface' ? deleteRule(rules, pair) : setRule(rules, pair, 'suppress');
      });
    },
    [writeGlobal]
  );

  const stopIgnoringEverywhere = useCallback(
    (repeatedWord: string) => {
      const pair = normalizePair(repeatedWord);
      writeGlobal(repeatedWord, rules => {
        const current = rules[pair] as RuleVerdict | undefined;
        // Toggle principle: if there's a 'suppress' rule, just remove it.
        // Otherwise write 'surface' to override a lower-layer verdict (e.g.
        // Greek Room `legitimate`) globally for this pair (BUG #4).
        return current === 'suppress' ? deleteRule(rules, pair) : setRule(rules, pair, 'surface');
      });
    },
    [writeGlobal]
  );

  return useMemo(
    () => ({
      occurrenceRules,
      globalRules,
      globalIgnoresAvailable,
      settingsProbeResolved,
      ignoreHere,
      ignoreEverywhere,
      undoOccurrence,
      stopIgnoringEverywhere,
    }),
    [
      occurrenceRules,
      globalRules,
      globalIgnoresAvailable,
      settingsProbeResolved,
      ignoreHere,
      ignoreEverywhere,
      undoOccurrence,
      stopIgnoringEverywhere,
    ]
  );
};
