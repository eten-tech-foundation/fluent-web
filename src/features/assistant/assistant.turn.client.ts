import { config } from '@/lib/config';

import {
  assistantDelivery,
  assistantFrames,
  assistantResponseJson,
  malformedStream,
  utf8Bytes,
} from './assistant.stream';
import {
  assistantTurnEventSchema,
  assistantTurnRequestSchema,
  TURN_LIMITS,
  type AssistantPrefix,
  type AssistantTurnEvent,
  type AssistantTurnRequest,
} from './assistant.turn.types';
import { AssistantBriefingError } from './assistant.types';

export type TurnUpdate =
  | Extract<AssistantTurnEvent, { type: 'turn_started' | 'context_changed' }>
  | {
      type: 'prefix';
      operationId: string;
      prefix: AssistantPrefix;
    };

export async function streamAssistantTurn(
  projectId: number,
  request: AssistantTurnRequest,
  publish: (update: TurnUpdate) => void,
  signal: AbortSignal
): Promise<void> {
  const admitted = assistantTurnRequestSchema.safeParse(request);
  if (!admitted.success) throw new AssistantBriefingError('context_too_large', false);
  const delivery = assistantDelivery(signal);
  try {
    const response = await delivery.wait(
      fetch(`${config.api.url}/projects/${projectId}/assistant/turns`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(admitted.data),
        signal: delivery.signal,
      })
    );
    delivery.activity();
    if (!response.ok) {
      let error = new AssistantBriefingError(
        response.status === 429 ? 'rate_limited' : 'temporarily_unavailable',
        response.status >= 429
      );
      try {
        const body = await assistantResponseJson(response, delivery);
        const parsed = assistantTurnEventSchema.safeParse({
          ...(body as object),
          protocol: 'fluent-turn-v1',
          type: 'turn_error',
          operationId: 'http',
          turnId: request.submission.turnId,
          attemptId: request.submission.attemptId,
        });
        if (parsed.success && parsed.data.type === 'turn_error')
          error = new AssistantBriefingError(
            parsed.data.code,
            parsed.data.retryable,
            parsed.data.retryAfter
          );
      } catch (failure) {
        if (failure instanceof AssistantBriefingError && failure.code === 'timed_out')
          throw failure;
        /* Arbitrary HTTP bodies never become visible text. */
      }
      throw error;
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
      throw malformedStream();
    let operationId: string | null = null;
    let terminal: AssistantTurnEvent | null = null;
    let markdown = '';
    let sequence = 0;
    for await (const raw of assistantFrames(response.body, delivery, true)) {
      const parsed = assistantTurnEventSchema.safeParse(raw);
      if (!parsed.success || terminal) throw malformedStream();
      const event = parsed.data;
      if (event.type === 'context_changed') {
        if (operationId) throw malformedStream();
        terminal = event;
        continue;
      }
      if (
        event.turnId !== request.submission.turnId ||
        event.attemptId !== request.submission.attemptId
      )
        throw malformedStream();
      if (event.type === 'turn_started') {
        if (operationId || event.contextReceipt !== request.contextReceipt) throw malformedStream();
        operationId = event.operationId;
        const ids = new Set(request.turns.map(turn => turn.turnId));
        const reported = [...event.projection.omittedTurnIds, ...event.projection.emptyTurnIds];
        if (new Set(reported).size !== reported.length || reported.some(id => !ids.has(id)))
          throw malformedStream();
        publish(event);
      } else {
        if (!operationId || operationId !== event.operationId) throw malformedStream();
        if (event.type === 'turn_delta') {
          if (!event.delta || event.sequence !== sequence + 1) throw malformedStream();
          const next = markdown + event.delta;
          if (next.length > TURN_LIMITS.outputChars || utf8Bytes(next) > TURN_LIMITS.outputBytes)
            throw new AssistantBriefingError('context_too_large', false);
          markdown = next;
          sequence = event.sequence;
          publish({
            type: 'prefix',
            operationId,
            prefix: { markdown, sequence, complete: false, receipt: event.receipt },
          });
        } else {
          if (event.type === 'turn_complete' && (event.sequence !== sequence || !markdown.trim()))
            throw malformedStream();
          terminal = event;
        }
      }
    }
    if (!terminal) throw new AssistantBriefingError('stream_incomplete', true);
    if (terminal.type === 'context_changed') publish(terminal);
    else if (terminal.type === 'turn_error')
      throw new AssistantBriefingError(terminal.code, terminal.retryable, terminal.retryAfter);
    else
      publish({
        type: 'prefix',
        operationId: terminal.operationId,
        prefix: { markdown, sequence, complete: true, receipt: terminal.receipt },
      });
  } catch (error) {
    if (error instanceof AssistantBriefingError) throw error;
    throw new AssistantBriefingError('network_error', true);
  } finally {
    delivery.close();
  }
}
