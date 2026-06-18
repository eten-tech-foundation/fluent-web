/**
 * Type definitions for the Checks feature (Repeated Word Check, cards #277/#278).
 *
 * This module deliberately mixes two naming conventions:
 *
 *  1. **Wire types** (the `*Request` / `*Response` / `*Finding` / envelope shapes)
 *     mirror the fluent-ai contract **verbatim in snake_case** (`lang_code`,
 *     `snt_id`, `repeated_word`, `start_position`, …). This is the same
 *     intentional, contained exception fluent-api made — see fluent-api decision
 *     **D8** and the proposal §6.1 note. Do **not** "normalize" these to
 *     camelCase: renaming silently breaks the verbatim pass-through contract with
 *     fluent-ai (the request body is forwarded unchanged through fluent-api).
 *     Approved in review:
 *     https://github.com/eten-tech-foundation/fluent-api/pull/173#discussion_r3343677813
 *
 *  2. **UI-derived types** (resolved findings, rules, cascade verdicts) use the
 *     repo's normal **camelCase** convention. The snake_case exception is scoped
 *     strictly to the wire types above.
 */

// ---------------------------------------------------------------------------
// Wire types — snake_case, verbatim fluent-ai contract (fluent-api D8).
// Mirror of fluent-api `src/domains/ai-tools/ai-tools.types.ts` and
// `src/lib/services/fluent-ai/fluent-ai.types.ts`.
// ---------------------------------------------------------------------------

/** Job lifecycle status from the fluent-ai `ToolJobResponse` envelope. */
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** One verse sent for checking. `snt_id` is the verse identifier (see W4). */
export interface VerseInput {
  snt_id: string;
  text: string;
}

/**
 * Request body for `POST /ai/tools/greek-room/repeated-words`.
 * Forwarded verbatim by fluent-api to fluent-ai (D8). snake_case is intentional.
 */
export interface RepeatedWordsRequest {
  lang_code: string;
  lang_name: string;
  project_id: string | number;
  project_name: string;
  verses: VerseInput[];
}

/** A single consecutive-repeated-word finding from Greek Room. */
export interface RepeatedWordsFinding {
  /** Verse identifier, e.g. `"JDG 4:3"` (USFM book code; see W4). */
  snt_id: string;
  /** The repeated pair, NFC + lowercased by Greek Room, e.g. `"the the"`. */
  repeated_word: string;
  /** The original surface text as it appeared (preserves casing); display only. */
  surf: string;
  /** Character offset of the finding within the verse text. */
  start_position: number;
  /** Greek Room's verdict: `true` ⇒ intentional/correct (machine "Default Ignore"). */
  legitimate: boolean;
  /** Upstream numeric severity (e.g. 0.1 legitimate, 0.5 suspicious). */
  severity: number;
}

export interface RepeatedWordsSummary {
  total_findings: number;
  legitimate_count: number;
  verse_count: number;
}

/** The `result` payload when `status === "completed"`. */
export interface RepeatedWordsResult {
  lang_code: string;
  provider: string;
  check: string;
  findings: RepeatedWordsFinding[];
  summary: RepeatedWordsSummary;
}

/** fluent-ai's error shape inside the envelope. */
export interface ToolJobError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * The full `ToolJobResponse` envelope, passed through fluent-api unchanged (D9).
 * The hook consumes the whole envelope and branches on `status`, so a future
 * async/polling tool (`status: "queued"`) drops in without reshaping the UI.
 */
export interface ToolJobResponse<TResult> {
  job_id: string;
  tool: string;
  status: JobStatus;
  result: TResult | null;
  error: ToolJobError | null;
  created_at: string;
  completed_at: string | null;
}

/** Convenience alias for the repeated-words envelope. */
export type RepeatedWordsResponse = ToolJobResponse<RepeatedWordsResult>;

// ---------------------------------------------------------------------------
// UI-derived types — camelCase (the repo's normal convention).
// ---------------------------------------------------------------------------

/**
 * A tri-state suppression rule (W5/W6). `'suppress'` hides a finding,
 * `'surface'` forces it active (per-occurrence undo of a global rule or of a
 * Greek Room `legitimate` verdict). Absence of a key = silent (no opinion).
 */
export type RuleVerdict = 'suppress' | 'surface';

/**
 * Occurrence-level rules (cascade layer 2), scoped to one chapter assignment.
 * Keyed by occurrence identity `"{snt_id}|{repeated_word}|{ordinal}"`.
 * Persisted in the editor-state JSONB blob (`checkOccurrenceRules`).
 */
export type OccurrenceRules = Record<string, RuleVerdict>;

/**
 * User-global word-pair rules (cascade layer 1), across all the user's projects.
 * Keyed by the NFC-normalized `repeated_word` pair (e.g. `"the the"`).
 * Persisted in `user_settings.checkIgnoredWordPairs`.
 */
export type GlobalRules = Record<string, RuleVerdict>;

/** Why a finding is currently inactive (drives the dimmed ignore-type label). */
export type InactiveReason =
  | 'occurrence' // user "Ignore Here"
  | 'global' // user "Ignore Everywhere"
  | 'legitimate'; // Greek Room "Default Ignore"

/**
 * A finding after the three-layer cascade has been applied (§6.4).
 * Carries the original wire finding plus the derived identity and verdict.
 */
export interface ResolvedFinding {
  /** The raw finding from Greek Room (snake_case wire shape preserved). */
  finding: RepeatedWordsFinding;
  /**
   * Index of this finding among same-`repeated_word` findings in the same
   * verse, ordered by `start_position` (the "x of n" ordinal, W4). Zero-based.
   */
  ordinal: number;
  /** Stable occurrence identity key: `"{snt_id}|{repeated_word}|{ordinal}"`. */
  occurrenceKey: string;
  /** Whether the finding is currently active (counts toward the dot). */
  isActive: boolean;
  /** Present only when `isActive === false`: which layer suppressed it. */
  inactiveReason?: InactiveReason;
}

/** Output of the cascade: findings split into active and inactive buckets. */
export interface ResolvedFindings {
  active: ResolvedFinding[];
  inactive: ResolvedFinding[];
}
