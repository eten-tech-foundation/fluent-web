import { describe, expect, it } from 'vitest';

import { type GlobalRules, type OccurrenceRules, type RepeatedWordsFinding } from '../checks.types';

import { buildOccurrenceKey, normalizePair, resolveFindings } from './useResolvedFindings';

/**
 * Factory for a Greek Room finding with sensible defaults. `surf` defaults to a
 * Title-cased echo of `repeated_word` to prove it is never used for comparison.
 */
const makeFinding = (over: Partial<RepeatedWordsFinding> = {}): RepeatedWordsFinding => ({
  snt_id: 'JDG 4:3',
  repeated_word: 'the the',
  surf: 'The the',
  start_position: 0,
  legitimate: false,
  severity: 0.5,
  ...over,
});

const NO_OCCURRENCE: OccurrenceRules = {};
const NO_GLOBAL: GlobalRules = {};

describe('normalizePair', () => {
  it('NFC-normalizes without case folding', () => {
    // Decomposed "é" (e + combining acute) vs. composed "é".
    const decomposed = 'cafe\u0301 cafe\u0301';
    const composed = 'caf\u00e9 caf\u00e9';
    expect(normalizePair(decomposed)).toBe(normalizePair(composed));
    // Case is preserved (no folding).
    expect(normalizePair('The The')).toBe('The The');
    expect(normalizePair('The The')).not.toBe(normalizePair('the the'));
  });
});

describe('buildOccurrenceKey', () => {
  it('formats as "{snt_id}|{repeated_word}|{ordinal}" with NFC-normalized pair', () => {
    expect(buildOccurrenceKey('JDG 4:3', 'the the', 0)).toBe('JDG 4:3|the the|0');
  });

  it('produces equal keys for composed/decomposed accent variants', () => {
    const decomposed = buildOccurrenceKey('GEN 1:1', 'cafe\u0301 cafe\u0301', 1);
    const composed = buildOccurrenceKey('GEN 1:1', 'caf\u00e9 caf\u00e9', 1);
    expect(decomposed).toBe(composed);
  });
});

describe('resolveFindings — Greek Room layer (layer 0)', () => {
  it('suspicious findings are active', () => {
    const result = resolveFindings([makeFinding({ legitimate: false })], NO_OCCURRENCE, NO_GLOBAL);
    expect(result.active).toHaveLength(1);
    expect(result.inactive).toHaveLength(0);
  });

  it('legitimate findings are inactive with reason "legitimate"', () => {
    const result = resolveFindings([makeFinding({ legitimate: true })], NO_OCCURRENCE, NO_GLOBAL);
    expect(result.active).toHaveLength(0);
    expect(result.inactive).toHaveLength(1);
    expect(result.inactive[0].inactiveReason).toBe('legitimate');
  });
});

describe('resolveFindings — global layer (layer 1)', () => {
  it('global suppress hides an otherwise-suspicious finding (reason "global")', () => {
    const global: GlobalRules = { 'the the': 'suppress' };
    const result = resolveFindings([makeFinding()], NO_OCCURRENCE, global);
    expect(result.active).toHaveLength(0);
    expect(result.inactive[0].inactiveReason).toBe('global');
  });

  it('global surface re-activates a Greek-Room-legitimate finding', () => {
    const global: GlobalRules = { 'the the': 'surface' };
    const result = resolveFindings([makeFinding({ legitimate: true })], NO_OCCURRENCE, global);
    expect(result.active).toHaveLength(1);
    expect(result.inactive).toHaveLength(0);
  });

  it('global rule matches via NFC normalization', () => {
    // Stored rule composed; finding decomposed.
    const global: GlobalRules = { [normalizePair('caf\u00e9 caf\u00e9')]: 'suppress' };
    const finding = makeFinding({ repeated_word: 'cafe\u0301 cafe\u0301' });
    const result = resolveFindings([finding], NO_OCCURRENCE, global);
    expect(result.inactive).toHaveLength(1);
    expect(result.inactive[0].inactiveReason).toBe('global');
  });
});

describe('resolveFindings — occurrence layer (layer 2) precedence', () => {
  it('occurrence suppress beats a silent global (reason "occurrence")', () => {
    const occ: OccurrenceRules = { 'JDG 4:3|the the|0': 'suppress' };
    const result = resolveFindings([makeFinding()], occ, NO_GLOBAL);
    expect(result.inactive[0].inactiveReason).toBe('occurrence');
  });

  it('occurrence surface overrides a global suppress (most specific wins)', () => {
    const occ: OccurrenceRules = { 'JDG 4:3|the the|0': 'surface' };
    const global: GlobalRules = { 'the the': 'suppress' };
    const result = resolveFindings([makeFinding()], occ, global);
    expect(result.active).toHaveLength(1);
    expect(result.inactive).toHaveLength(0);
  });

  it('occurrence suppress overrides a global surface (most specific wins)', () => {
    const occ: OccurrenceRules = { 'JDG 4:3|the the|0': 'suppress' };
    const global: GlobalRules = { 'the the': 'surface' };
    const result = resolveFindings([makeFinding({ legitimate: true })], occ, global);
    expect(result.inactive[0].inactiveReason).toBe('occurrence');
  });

  it('occurrence surface overrides a Greek-Room-legitimate verdict', () => {
    const occ: OccurrenceRules = { 'JDG 4:3|the the|0': 'surface' };
    const result = resolveFindings([makeFinding({ legitimate: true })], occ, NO_GLOBAL);
    expect(result.active).toHaveLength(1);
  });
});

describe('resolveFindings — full precedence matrix', () => {
  // most-specific non-silent verdict wins; layer 0 is the Greek Room verdict.
  interface Case {
    occ?: 'suppress' | 'surface';
    global?: 'suppress' | 'surface';
    legitimate: boolean;
    expectActive: boolean;
    reason?: 'occurrence' | 'global' | 'legitimate';
  }

  const cases: Case[] = [
    // occurrence dominates regardless of lower layers
    {
      occ: 'suppress',
      global: 'surface',
      legitimate: false,
      expectActive: false,
      reason: 'occurrence',
    },
    { occ: 'surface', global: 'suppress', legitimate: true, expectActive: true },
    // global decides when occurrence is silent
    { global: 'suppress', legitimate: false, expectActive: false, reason: 'global' },
    { global: 'surface', legitimate: true, expectActive: true },
    // greek room decides when both upper layers silent
    { legitimate: true, expectActive: false, reason: 'legitimate' },
    { legitimate: false, expectActive: true },
  ];

  it.each(cases)(
    'occ=$occ global=$global legitimate=$legitimate -> active=$expectActive',
    ({ occ, global, legitimate, expectActive, reason }: Case) => {
      const occRules: OccurrenceRules = occ ? { 'JDG 4:3|the the|0': occ } : {};
      const globalRules: GlobalRules = global ? { 'the the': global } : {};
      const result = resolveFindings([makeFinding({ legitimate })], occRules, globalRules);

      if (expectActive) {
        expect(result.active).toHaveLength(1);
        expect(result.inactive).toHaveLength(0);
      } else {
        expect(result.inactive).toHaveLength(1);
        expect(result.inactive[0].inactiveReason).toBe(reason);
      }
    }
  );
});

describe('resolveFindings — ordinal assignment', () => {
  it('numbers same-pair findings in a verse by start_position (zero-based)', () => {
    // Provided out of order; ordinals must follow start_position, not input order.
    const findings = [
      makeFinding({ start_position: 40 }),
      makeFinding({ start_position: 10 }),
      makeFinding({ start_position: 25 }),
    ];
    const result = resolveFindings(findings, NO_OCCURRENCE, NO_GLOBAL);
    const byStart = new Map([...result.active].map(r => [r.finding.start_position, r.ordinal]));
    expect(byStart.get(10)).toBe(0);
    expect(byStart.get(25)).toBe(1);
    expect(byStart.get(40)).toBe(2);
  });

  it('keeps ordinals independent per repeated_word and per verse', () => {
    const findings = [
      makeFinding({ snt_id: 'JDG 4:3', repeated_word: 'the the', start_position: 5 }),
      makeFinding({ snt_id: 'JDG 4:3', repeated_word: 'and and', start_position: 20 }),
      makeFinding({ snt_id: 'JDG 4:4', repeated_word: 'the the', start_position: 0 }),
    ];
    const result = resolveFindings(findings, NO_OCCURRENCE, NO_GLOBAL);
    // Each is the first (ordinal 0) of its own (verse, pair) group.
    expect(result.active.every(r => r.ordinal === 0)).toBe(true);
    expect(result.active.map(r => r.occurrenceKey).sort()).toEqual(
      ['JDG 4:3|and and|0', 'JDG 4:3|the the|0', 'JDG 4:4|the the|0'].sort()
    );
  });

  it('handles the "the the the" overlap: two findings, ordinals 0 and 1', () => {
    // A triple repetition yields two overlapping consecutive-pair findings.
    const findings = [
      makeFinding({ start_position: 0, surf: 'the the' }),
      makeFinding({ start_position: 4, surf: 'the the' }),
    ];
    const result = resolveFindings(findings, NO_OCCURRENCE, NO_GLOBAL);
    const ordinals = result.active.map(r => r.ordinal).sort();
    expect(ordinals).toEqual([0, 1]);
    expect(result.active.map(r => r.occurrenceKey).sort()).toEqual(
      ['JDG 4:3|the the|0', 'JDG 4:3|the the|1'].sort()
    );
  });

  it('allows independently suppressing one occurrence of an overlap', () => {
    const findings = [makeFinding({ start_position: 0 }), makeFinding({ start_position: 4 })];
    const occ: OccurrenceRules = { 'JDG 4:3|the the|1': 'suppress' };
    const result = resolveFindings(findings, occ, NO_GLOBAL);
    expect(result.active).toHaveLength(1);
    expect(result.active[0].ordinal).toBe(0);
    expect(result.inactive).toHaveLength(1);
    expect(result.inactive[0].ordinal).toBe(1);
    expect(result.inactive[0].inactiveReason).toBe('occurrence');
  });
});

describe('resolveFindings — output shape', () => {
  it('preserves the original finding reference and omits inactiveReason when active', () => {
    const finding = makeFinding();
    const result = resolveFindings([finding], NO_OCCURRENCE, NO_GLOBAL);
    expect(result.active[0].finding).toBe(finding);
    expect(result.active[0]).not.toHaveProperty('inactiveReason');
    expect(result.active[0].occurrenceKey).toBe('JDG 4:3|the the|0');
  });

  it('returns empty buckets for no findings', () => {
    const result = resolveFindings([], NO_OCCURRENCE, NO_GLOBAL);
    expect(result.active).toEqual([]);
    expect(result.inactive).toEqual([]);
  });

  it('puts inactiveReason on inactive findings', () => {
    const result = resolveFindings([makeFinding({ legitimate: true })], NO_OCCURRENCE, NO_GLOBAL);
    expect(result.inactive[0]).toHaveProperty('inactiveReason', 'legitimate');
  });

  it('includes occurrenceKey on inactive findings', () => {
    const occ: OccurrenceRules = { 'JDG 4:3|the the|0': 'suppress' };
    const result = resolveFindings([makeFinding()], occ, NO_GLOBAL);
    expect(result.inactive[0].occurrenceKey).toBe('JDG 4:3|the the|0');
  });
});

describe('resolveFindings — multi-verse, multi-pair scenarios', () => {
  it('handles findings from multiple verses independently', () => {
    const occ: OccurrenceRules = { 'JDG 4:3|the the|0': 'suppress' };
    const findings = [
      makeFinding({ snt_id: 'JDG 4:3', repeated_word: 'the the' }),
      makeFinding({ snt_id: 'JDG 4:4', repeated_word: 'the the' }),
    ];
    const result = resolveFindings(findings, occ, NO_GLOBAL);
    // The JDG 4:3 occurrence is suppressed; JDG 4:4 one is not (it's a different verse).
    expect(result.active).toHaveLength(1);
    expect(result.active[0].finding.snt_id).toBe('JDG 4:4');
    expect(result.inactive).toHaveLength(1);
    expect(result.inactive[0].finding.snt_id).toBe('JDG 4:3');
  });

  it('handles multiple different pairs in the same verse', () => {
    const global: GlobalRules = { 'and and': 'suppress' };
    const findings = [
      makeFinding({ repeated_word: 'the the' }),
      makeFinding({ repeated_word: 'and and', start_position: 10 }),
    ];
    const result = resolveFindings(findings, NO_OCCURRENCE, global);
    expect(result.active).toHaveLength(1);
    expect(result.active[0].finding.repeated_word).toBe('the the');
    expect(result.inactive).toHaveLength(1);
    expect(result.inactive[0].finding.repeated_word).toBe('and and');
    expect(result.inactive[0].inactiveReason).toBe('global');
  });

  it('preserves input order of findings in the output buckets', () => {
    // Two findings, same pair and verse, out of order by start_position.
    // Ordinals are assigned by start_position, but the output ordering
    // reflects the *input* order (the caller's order is preserved).
    const findings = [
      makeFinding({ start_position: 40, surf: 'B the the' }),
      makeFinding({ start_position: 10, surf: 'A the the' }),
    ];
    const result = resolveFindings(findings, NO_OCCURRENCE, NO_GLOBAL);
    // Both active; input order preserved (start_position:40 first, then 10).
    expect(result.active[0].finding.surf).toBe('B the the');
    expect(result.active[1].finding.surf).toBe('A the the');
    // But ordinals follow start_position: start_position:10 is ordinal 0, 40 is ordinal 1.
    expect(result.active[0].ordinal).toBe(1); // was start_position:40
    expect(result.active[1].ordinal).toBe(0); // was start_position:10
  });
});

describe('resolveFindings — occurrence key uniqueness', () => {
  it('builds unique occurrence keys for same pair across different verses', () => {
    const findings = [
      makeFinding({ snt_id: 'JDG 4:3' }),
      makeFinding({ snt_id: 'JDG 4:4' }),
    ];
    const result = resolveFindings(findings, NO_OCCURRENCE, NO_GLOBAL);
    const keys = result.active.map(r => r.occurrenceKey);
    expect(new Set(keys).size).toBe(2); // all unique
    expect(keys).toContain('JDG 4:3|the the|0');
    expect(keys).toContain('JDG 4:4|the the|0');
  });

  it('builds unique occurrence keys for different pairs in the same verse', () => {
    const findings = [
      makeFinding({ repeated_word: 'the the', start_position: 0 }),
      makeFinding({ repeated_word: 'and and', start_position: 10 }),
    ];
    const result = resolveFindings(findings, NO_OCCURRENCE, NO_GLOBAL);
    const keys = result.active.map(r => r.occurrenceKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys).toContain('JDG 4:3|the the|0');
    expect(keys).toContain('JDG 4:3|and and|0');
  });
});
