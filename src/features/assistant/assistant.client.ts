import { z } from 'zod';

import { config } from '@/lib/config';

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

async function responseFailure(response: Response): Promise<AssistantBriefingError> {
  let code = response.status === 429 ? 'rate_limited' : 'temporarily_unavailable';
  let retryable = response.status >= 429;
  let retryAfterSeconds: number | undefined;
  try {
    const parsed = errorSchema
      .pick({ code: true, retryable: true, retryAfter: true })
      .parse(await response.json());
    code = parsed.code;
    retryable = parsed.retryable;
    retryAfterSeconds = parsed.retryAfter;
  } catch {
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

interface ParsedSseEvent {
  event: string | null;
  data: string;
}

function parseEventBlock(block: string): ParsedSseEvent | null {
  let event: string | null = null;
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  return data.length === 0 ? null : { event, data: data.join('\n') };
}

export async function* parseAssistantEventStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reading = true;
  while (reading) {
    const { done, value } = await reader.read();
    reading = !done;
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: reading });
    let boundary = /\r?\n\r?\n/.exec(buffer);
    while (boundary) {
      const parsed = parseEventBlock(buffer.slice(0, boundary.index));
      buffer = buffer.slice(boundary.index + boundary[0].length);
      if (parsed) {
        let json: unknown;
        try {
          json = JSON.parse(parsed.data);
        } catch {
          throw new AssistantBriefingError('malformed_upstream_response', true);
        }
        const event = streamEventSchema.safeParse(json);
        if (!event.success || (parsed.event !== null && parsed.event !== event.data.type)) {
          throw new AssistantBriefingError('malformed_upstream_response', true);
        }
        yield event.data;
      }
      boundary = /\r?\n\r?\n/.exec(buffer);
    }
  }
  if (buffer.trim()) throw new AssistantBriefingError('stream_incomplete', true);
}

export async function streamPassageBriefing(
  request: PassageBriefingRequest,
  publish: (data: PassageBriefingData) => void,
  signal?: AbortSignal
): Promise<PassageBriefingData> {
  let response: Response;
  try {
    response = await fetch(
      `${config.api.url}/projects/${String(request.projectId)}/assistant/briefing`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPassageBriefingBody(request)),
        signal,
      }
    );
  } catch {
    throw new AssistantBriefingError('network_error', true);
  }
  if (!response.ok) throw await responseFailure(response);
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
  for await (const event of parseAssistantEventStream(response.body)) {
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
    } else if (event.type === 'briefing_error') {
      if (!started) throw new AssistantBriefingError('malformed_upstream_response', true);
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
    // Completion becomes observable only after the stream closes cleanly. Until then a trailing
    // event, truncated frame, or reader failure can still invalidate the provider response.
    if (!completed) publish(current);
  }
  if (current.phase !== 'complete') throw new AssistantBriefingError('stream_incomplete', true);
  publish(current);
  return current;
}
