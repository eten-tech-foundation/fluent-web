import { useMemo } from 'react';

import {
  type GlobalRules,
  type InactiveReason,
  type OccurrenceRules,
  type RepeatedWordsFinding,
  type ResolvedFinding,
  type ResolvedFindings,
  type RuleVerdict,
} from '../checks.types';

/**
 * Pure three-layer suppression cascade (W5/W6, §6.4).
 *
 * Every finding resolves to active/inactive through three layers; the
 * **most-specific non-silent verdict wins** (specificity, not temporal order,
 * so the result is deterministic and reproducible from stored state):
 *
 *   | Layer | Scope                              | Verdicts                          |
 *   | ----- | ---------------------------------- | --------------------------------- |
 *   | 2     | occurrence (this chapter)          | silent / 'suppress' / 'surface'   |
 *   | 1     | word pair (all the user's projects)| silent / 'suppress' / 'surface'   |
 *   | 0     | Greek Room verdict (`legitimate`)  | active / inactive (always present)|
 *
 * Layer 2 (occurrence) is more specific than layer 1 (global), which is more
 * specific than layer 0 (Greek Room). A `'surface'` rule at any layer forces
 * the finding active (per-occurrence undo of a global rule or of a Greek Room
 * `legitimate` verdict); a `'suppress'` rule forces it inactive; absence of a
 * rule (silent) defers to the next-less-specific layer.
 *
 * This module is intentionally a pure function (wrapped in a memo hook) with no
 * I/O — it is exhaustively unit-tested in `useResolvedFindings.test.ts`.
 */

/**
 * NFC-normalize a string for comparison/keying. We normalize but deliberately
 * do **not** case-fold: Unicode case folding is locale-sensitive (the Turkish
 * dotless-ı problem) and Fluent targets minority languages. Greek Room already
 * delivers `repeated_word` lowercased, so case equivalence is wholly its policy,
 * inherited here rather than re-implemented (W4, §6.3).
 */
export const normalizePair = (repeatedWord: string): string => repeatedWord.normalize('NFC');

/**
 * Build the stable occurrence-identity key `"{snt_id}|{repeated_word}|{ordinal}"`.
 * The `repeated_word` segment is NFC-normalized so a stored rule matches a fresh
 * finding regardless of composed/decomposed accent representation. The `|`
 * separator cannot appear in a `snt_id`, and `repeated_word` is the final
 * segment-pair, so keys are unambiguous (§7.1).
 */
export const buildOccurrenceKey = (sntId: string, repeatedWord: string, ordinal: number): string =>
  `${sntId}|${normalizePair(repeatedWord)}|${ordinal}`;

/**
 * Assign each finding its ordinal: the index among findings in the **same
 * verse** with the **same (NFC-normalized) `repeated_word`**, ordered by
 * `start_position` ("x of n", zero-based). Computed from Greek Room's findings
 * only — we never tokenize verse text ourselves (W4, §6.3).
 *
 * Caveat (§6.3): a triple repetition ("the the the") yields two overlapping
 * findings, which receive ordinals 0 and 1. Mechanically fine; accepted for v1.
 */
const assignOrdinals = (
  findings: RepeatedWordsFinding[]
): Array<{ finding: RepeatedWordsFinding; ordinal: number }> => {
  // Counter per (snt_id, normalized repeated_word). We must process each group
  // in start_position order so ordinals are stable against unrelated edits.
  const groups = new Map<string, RepeatedWordsFinding[]>();
  for (const finding of findings) {
    const groupKey = `${finding.snt_id}|${normalizePair(finding.repeated_word)}`;
    const bucket = groups.get(groupKey);
    if (bucket) {
      bucket.push(finding);
    } else {
      groups.set(groupKey, [finding]);
    }
  }

  // Map each finding (by reference identity) to its assigned ordinal.
  const ordinalOf = new Map<RepeatedWordsFinding, number>();
  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort((a, b) => a.start_position - b.start_position);
    ordered.forEach((finding, index) => ordinalOf.set(finding, index));
  }

  // Preserve the caller's original finding order in the output.
  return findings.map(finding => ({
    finding,
    ordinal: ordinalOf.get(finding) ?? 0,
  }));
};

/**
 * Resolve one finding through the cascade. Returns whether it is active and, if
 * not, which layer suppressed it.
 */
/**
 * Look up a verdict in a tri-state rule map. The map's value type is
 * `RuleVerdict`, but a missing key yields `undefined` at runtime; this helper
 * makes that `| undefined` explicit (the tsconfig has no `noUncheckedIndexed
 * AccessProperty`, so a bare index access would over-narrow).
 */
const lookupVerdict = (
  rules: OccurrenceRules | GlobalRules,
  key: string
): RuleVerdict | undefined => (key in rules ? rules[key] : undefined);

const resolveOne = (
  finding: RepeatedWordsFinding,
  occurrenceKey: string,
  occurrenceRules: OccurrenceRules,
  globalRules: GlobalRules
): { isActive: boolean; inactiveReason?: InactiveReason } => {
  // Layer 2 — occurrence rule (most specific). A present verdict wins outright:
  // 'suppress' => inactive (reason 'occurrence'); 'surface' => active.
  const occurrenceVerdict = lookupVerdict(occurrenceRules, occurrenceKey);
  if (occurrenceVerdict !== undefined) {
    return occurrenceVerdict === 'suppress'
      ? { isActive: false, inactiveReason: 'occurrence' }
      : { isActive: true };
  }

  // Layer 1 — user-global word-pair rule.
  const globalVerdict = lookupVerdict(globalRules, normalizePair(finding.repeated_word));
  if (globalVerdict !== undefined) {
    return globalVerdict === 'suppress'
      ? { isActive: false, inactiveReason: 'global' }
      : { isActive: true };
  }

  // Layer 0 — Greek Room verdict.
  if (finding.legitimate) {
    return { isActive: false, inactiveReason: 'legitimate' };
  }
  return { isActive: true };
};

/**
 * Resolve a list of raw findings into `{ active[], inactive[] }` given the
 * occurrence- and global-rule maps. Pure; safe to call outside React.
 */
export const resolveFindings = (
  findings: RepeatedWordsFinding[],
  occurrenceRules: OccurrenceRules,
  globalRules: GlobalRules
): ResolvedFindings => {
  const withOrdinals = assignOrdinals(findings);

  const active: ResolvedFinding[] = [];
  const inactive: ResolvedFinding[] = [];

  for (const { finding, ordinal } of withOrdinals) {
    const occurrenceKey = buildOccurrenceKey(finding.snt_id, finding.repeated_word, ordinal);
    const { isActive, inactiveReason } = resolveOne(
      finding,
      occurrenceKey,
      occurrenceRules,
      globalRules
    );

    const resolved: ResolvedFinding = {
      finding,
      ordinal,
      occurrenceKey,
      isActive,
      ...(isActive ? {} : { inactiveReason }),
    };

    if (isActive) {
      active.push(resolved);
    } else {
      inactive.push(resolved);
    }
  }

  return { active, inactive };
};

export interface UseResolvedFindingsParams {
  findings: RepeatedWordsFinding[];
  occurrenceRules: OccurrenceRules;
  globalRules: GlobalRules;
}

/**
 * React hook wrapper around {@link resolveFindings}, memoized on its inputs.
 * The notification dot counts `active.length`.
 */
export const useResolvedFindings = ({
  findings,
  occurrenceRules,
  globalRules,
}: UseResolvedFindingsParams): ResolvedFindings =>
  useMemo(
    () => resolveFindings(findings, occurrenceRules, globalRules),
    [findings, occurrenceRules, globalRules]
  );
