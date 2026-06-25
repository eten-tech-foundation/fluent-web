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

/** The user-settings blob behind `/self/settings`. Tolerant of absent keys. */
interface SelfSettings {
  /** Global word-pair rules, keyed by NFC-normalized `repeated_word`. */
  checkIgnoredWordPairs?: GlobalRules;
}

/** GET response: the server returns `{ settings }`, possibly `null` (W8). */
interface SelfSettingsResponse {
  settings: SelfSettings | null;
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
    return pairs;
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
    return { available: true, rules: extractGlobalRules(body?.settings ?? null) };
  } catch (error) {
    Logger.logException(error, { context: 'Repeated-words self/settings probe failed' });
    return { available: false, rules: {} };
  }
};

/**
 * PUT the full settings blob (full-replace, §8.1). The caller supplies the
 * complete `checkIgnoredWordPairs` map it wants persisted; this hook never
 * sends a partial patch.
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

  useEffect(() => {
    if (probeStarted.current) {
      return;
    }
    probeStarted.current = true;
    void probeSelfSettings().then(({ available, rules }) => {
      if (!mounted.current) {
        return;
      }
      setGlobalIgnoresAvailable(available);
      setGlobalRules(available ? rules : {});
      setSettingsProbeResolved(true);
    });
  }, []);

  // Latest occurrence map for read-modify-write inside callbacks without
  // making the callbacks change identity on every keystroke.
  const occurrenceRef = useRef(occurrenceRules);
  occurrenceRef.current = occurrenceRules;

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

  /** Apply a current-chapter purge for `pair` through the single writer. */
  const purgeCurrentChapter = useCallback(
    (repeatedWord: string) => {
      const { rules, changed } = purgeLocalForPair(occurrenceRef.current, repeatedWord);
      if (changed) {
        saveOccurrenceRules(rules);
      }
    },
    [saveOccurrenceRules]
  );

  const writeGlobal = useCallback(
    (repeatedWord: string, mutate: (rules: GlobalRules) => GlobalRules) => {
      const pair = normalizePair(repeatedWord);
      const previous = globalRules;
      const next = mutate(previous);
      // Optimistic: the finding greys/un-greys immediately.
      setGlobalRules(next);
      // Purge current-chapter occurrence rules for the pair so the just-clicked
      // panel doesn't appear to ignore the action (occurrence beats global).
      purgeCurrentChapter(pair);
      void putSelfSettings(next).catch(error => {
        Logger.logException(error, {
          context: 'Repeated-words global ignore write failed; rolling back',
        });
        if (mounted.current) {
          // Rollback: the flag returns to its prior state; re-click allowed.
          // (No queued retry for v1 — the visible flip is the failure notice.)
          setGlobalRules(previous);
        }
      });
    },
    [globalRules, purgeCurrentChapter]
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
