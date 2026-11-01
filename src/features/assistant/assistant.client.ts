import { z } from 'zod';

import { config } from '@/lib/config';

import {
  assistantDelivery,
  assistantFrames,
  assistantResponseJson,
  malformedStream,
  utf8Bytes,
  type AssistantDelivery,
} from './assistant.stream';
import { briefingIntegrityMetadataSchema, TURN_LIMITS } from './assistant.turn.types';
import {
  AssistantBriefingError,
  type AssistantFailureCode,
  type AssistantLanguagesResponse,
  type PassageBriefingData,
  type PassageBriefingRequest,
} from './assistant.types';

const languageCodeSchema = z.string().min(1).max(20);
const languagesResponseSchema = z
  .object({
    languages: z
      .array(z.object({ code: languageCodeSchema, displayName: z.string().min(1).max(100) }))
      .max(100),
    defaultLanguage: languageCodeSchema,
    englishFallback: languageCodeSchema,
  })
  .superRefine((value, context) => {
    const codes = new Set(value.languages.map(language => language.code));
    if (!codes.has(value.defaultLanguage) || !codes.has(value.englishFallback)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Unknown default language' });
    }
  });

const startedSchema = z.object({
  type: z.literal('briefing_started'),
  attemptId: z.string().min(1).max(100),
  operationVersion: z.string().min(1).max(64),
  cacheEpoch: z.string().min(1).max(64),
  outputContractVersion: z.string().min(1).max(64),
  references: z.array(z.string().min(1).max(100)).max(1000),
});
const deltaSchema = z.object({ type: z.literal('briefing_delta'), delta: z.string() });
const completeSchema = z.object({
  type: z.literal('briefing_complete'),
  markdown: z.string(),
  operationVersion: z.string().min(1).max(64),
  cacheEpoch: z.string().min(1).max(64),
  outputContractVersion: z.string().min(1).max(64),
  outputLanguage: languageCodeSchema,
  cacheHit: z.boolean().optional(),
});
const errorSchema = z.object({
  type: z.literal('briefing_error'),
  code: z.string().min(1).max(64),
  retryable: z.boolean(),
  retryAfter: z.number().int().nonnegative().optional(),
});
const streamEventSchema = z.discriminatedUnion('type', [
  startedSchema,
  deltaSchema,
  completeSchema,
  errorSchema,
]);

type StreamEvent = z.infer<typeof streamEventSchema>;

const FAILURE_CODES = new Set<AssistantFailureCode>([
  'invalid_request',
  'unsupported_language',
  'context_too_large',
  'rate_limited',
  'timed_out',
  'temporarily_unavailable',
  'malformed_upstream_response',
]);

function normalizedFailure(code: string): AssistantFailureCode {
  return FAILURE_CODES.has(code as AssistantFailureCode)
    ? (code as AssistantFailureCode)
    : 'temporarily_unavailable';
}

export function buildPassageBriefingBody(request: PassageBriefingRequest): Record<string, unknown> {
  return {
    bookCode: request.bookCode,
    chapter: request.chapter,
    activeVerse: request.activeVerse,
    outputLanguage: request.outputLanguage,
    ...(request.grounding === null ? {} : { grounding: request.grounding }),
    ...(request.ignoreCache ? { ignore_cache: true } : {}),
  };
}

async function responseFailure(
  response: Response,
  delivery?: AssistantDelivery
): Promise<AssistantBriefingError> {
  let code = response.status === 429 ? 'rate_limited' : 'temporarily_unavailable';
  let retryable = response.status >= 429;
  let retryAfterSeconds: number | undefined;
  try {
    const parsed = errorSchema
      .pick({ code: true, retryable: true, retryAfter: true })
      .parse(await assistantResponseJson(response, delivery));
    code = parsed.code;
    retryable = parsed.retryable;
    retryAfterSeconds = parsed.retryAfter;
  } catch (failure) {
    if (failure instanceof AssistantBriefingError && failure.code === 'timed_out') throw failure;
    // Never surface an arbitrary server body or upstream/provider detail.
  }
  return new AssistantBriefingError(normalizedFailure(code), retryable, retryAfterSeconds);
}

export async function fetchAssistantLanguages(
  projectId: number,
  persistedSelection: string | null
): Promise<AssistantLanguagesResponse> {
  const url = new URL(`${config.api.url}/projects/${String(projectId)}/assistant/languages`);
  if (persistedSelection) url.searchParams.set('selected', persistedSelection);
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw await responseFailure(response);
  const parsed = languagesResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new AssistantBriefingError('malformed_upstream_response', true);
  }
  return parsed.data;
}

export async function* parseAssistantEventStream(
  body: ReadableStream<Uint8Array>,
  delivery?: AssistantDelivery
): AsyncGenerator<StreamEvent & Record<string, unknown>> {
  for await (const raw of assistantFrames(body, delivery)) {
    const event = streamEventSchema.safeParse(raw);
    if (!event.success) throw malformedStream();
    yield { ...(raw as Record<string, unknown>), ...event.data };
  }
}

function commitIntegrity(
  current: PassageBriefingData,
  event: Record<string, unknown>
): PassageBriefingData {
  if (event.continuationUnavailable !== undefined) {
    if (
      event.continuationUnavailable !== 'temporarily_unavailable' &&
      event.continuationUnavailable !== 'context_too_large'
    )
      throw malformedStream();
    if (
      event.contextReceipt !== undefined ||
      event.prefix !== undefined ||
      event.protocol !== undefined
    )
      throw malformedStream();
    return {
      ...current,
      integrity: undefined,
      continuationUnavailable: event.continuationUnavailable,
    };
  }
  if (
    event.protocol === undefined &&
    event.contextReceipt === undefined &&
    event.prefix === undefined &&
    event.operationId === undefined
  ) {
    if (current.integrity) throw malformedStream();
    return current;
  }
  if (current.continuationUnavailable) throw malformedStream();
  const parsed = briefingIntegrityMetadataSchema.safeParse({
    protocol: event.protocol,
    contextReceipt: event.contextReceipt,
    operationId: event.operationId,
    prefix: event.prefix,
  });
  if (!parsed.success || !parsed.data.prefix) throw malformedStream();
  const metadata = parsed.data;
  const prefix = parsed.data.prefix;
  const previous = current.integrity;
  if (!previous && event.type !== 'briefing_started') throw malformedStream();
  const complete = event.type === 'briefing_complete';
  const expected =
    event.type === 'briefing_started'
      ? 0
      : (previous?.prefix.sequence ?? 0) + (event.type === 'briefing_delta' ? 1 : 0);
  if (
    metadata.operationId !== current.metadata?.attemptId ||
    (previous && metadata.contextReceipt !== previous.contextReceipt) ||
    prefix.sequence !== expected ||
    prefix.complete !== complete ||
    current.source.length > TURN_LIMITS.outputChars ||
    utf8Bytes(current.source) > TURN_LIMITS.outputBytes
  )
    throw malformedStream();
  return {
    ...current,
    integrity: {
      contextReceipt: metadata.contextReceipt,
      operationId: metadata.operationId,
      prefix: { ...prefix, markdown: current.source },
    },
  };
}

export async function streamPassageBriefing(
  request: PassageBriefingRequest,
  publish: (data: PassageBriefingData) => void,
  signal?: AbortSignal
): Promise<PassageBriefingData> {
  const delivery = assistantDelivery(signal);
  try {
    let response: Response;
    try {
      response = await delivery.wait(
        fetch(`${config.api.url}/projects/${String(request.projectId)}/assistant/briefing`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPassageBriefingBody(request)),
          signal: delivery.signal,
        })
      );
      delivery.activity();
    } catch (error) {
      if (error instanceof AssistantBriefingError) throw error;
      throw new AssistantBriefingError('network_error', true);
    }
    if (!response.ok) throw await delivery.wait(responseFailure(response, delivery));
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      throw new AssistantBriefingError('malformed_upstream_response', true);
    }

    let current: PassageBriefingData = {
      source: '',
      phase: 'streaming',
      metadata: null,
      outputLanguage: request.outputLanguage,
      cacheHit: false,
    };
    publish(current);
    let started = false;
    let completed = false;
    for await (const event of parseAssistantEventStream(response.body, delivery)) {
      if (completed) throw new AssistantBriefingError('malformed_upstream_response', true);
      if (event.type === 'briefing_started') {
        if (started) throw new AssistantBriefingError('malformed_upstream_response', true);
        started = true;
        current = {
          ...current,
          metadata: {
            attemptId: event.attemptId,
            operationVersion: event.operationVersion,
            cacheEpoch: event.cacheEpoch,
            outputContractVersion: event.outputContractVersion,
            references: event.references,
          },
        };
      } else if (event.type === 'briefing_delta') {
        if (!started) throw new AssistantBriefingError('malformed_upstream_response', true);
        current = { ...current, source: current.source + event.delta };
        if (utf8Bytes(current.source) > 96_000) throw malformedStream();
      } else if (event.type === 'briefing_error') {
        if (!started) throw new AssistantBriefingError('malformed_upstream_response', true);
        commitIntegrity(current, event);
        throw new AssistantBriefingError(
          normalizedFailure(event.code),
          event.retryable,
          event.retryAfter
        );
      } else {
        if (
          !started ||
          current.metadata === null ||
          current.source !== event.markdown ||
          current.metadata.operationVersion !== event.operationVersion ||
          current.metadata.cacheEpoch !== event.cacheEpoch ||
          current.metadata.outputContractVersion !== event.outputContractVersion ||
          request.outputLanguage !== event.outputLanguage
        ) {
          throw new AssistantBriefingError('malformed_upstream_response', true);
        }
        completed = true;
        current = { ...current, phase: 'complete', cacheHit: event.cacheHit === true };
      }
      current = commitIntegrity(current, event);
      // Completion becomes observable only after the stream closes cleanly. Until then a trailing
      // event, truncated frame, or reader failure can still invalidate the provider response.
      if (!completed) publish(current);
    }
    if (current.phase !== 'complete') throw new AssistantBriefingError('stream_incomplete', true);
    publish(current);
    return current;
  } finally {
    delivery.close();
  }
}
