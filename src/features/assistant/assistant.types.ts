import type { AssistantPrefix } from './assistant.turn.types';

export const ASSISTANT_OUTPUT_CONTRACT_VERSION = 'fluent-widgets-v1';
export const ASSISTANT_WEB_REQUEST_VERSION = 'passage-briefing-web-v1';

export type AssistantGroundingChoice = 'configured' | 'output_language' | 'english';

export interface AssistantLanguage {
  code: string;
  displayName: string;
}

export interface AssistantLanguagesResponse {
  languages: AssistantLanguage[];
  defaultLanguage: string;
  englishFallback: string;
}

export interface PassageBriefingContext {
  projectId: number;
  bookCode: string;
  chapter: number;
  activeVerse: number;
}

/**
 * Browser-owned request identity. It intentionally contains selectors and bounded choices only:
 * canonical source text and target/draft text are always resolved or excluded by Fluent API.
 */
export interface PassageBriefingBaseRequest extends PassageBriefingContext {
  outputLanguage: string;
  grounding: AssistantGroundingChoice | null;
  ignoreCache: boolean;
}

export interface PassageBriefingRequest extends PassageBriefingBaseRequest {
  attempt: number;
  /** Browser-only distinction: a stored bypass regenerates on reopen; one-shot force-fresh does not. */
  persistentIgnoreCache: boolean;
}

export interface PassageBriefingMetadata {
  attemptId: string;
  operationVersion: string;
  cacheEpoch: string;
  outputContractVersion: string;
  references: string[];
}

export interface PassageBriefingData {
  source: string;
  phase: 'streaming' | 'complete';
  metadata: PassageBriefingMetadata | null;
  outputLanguage: string;
  /** True only when Fluent API explicitly reports a completed backend cache hit. */
  cacheHit: boolean;
  integrity?: { contextReceipt: string; operationId: string; prefix: AssistantPrefix };
  continuationUnavailable?: 'temporarily_unavailable' | 'context_too_large';
}

export type AssistantFailureCode =
  | 'invalid_request'
  | 'unsupported_language'
  | 'context_too_large'
  | 'rate_limited'
  | 'timed_out'
  | 'temporarily_unavailable'
  | 'malformed_upstream_response'
  | 'stream_incomplete'
  | 'network_error';

export class AssistantBriefingError extends Error {
  constructor(
    public readonly code: AssistantFailureCode,
    public readonly retryable: boolean,
    public readonly retryAfterSeconds?: number
  ) {
    super(code);
    this.name = 'AssistantBriefingError';
  }
}
