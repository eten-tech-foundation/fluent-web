import { TURN_LIMITS } from './assistant.turn.types';
import { AssistantBriefingError } from './assistant.types';

export const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;
export const malformedStream = () =>
  new AssistantBriefingError('malformed_upstream_response', true);

/** One bounded delivery; cancellation never means cancellation of a shared API producer. */
export function assistantDelivery(signal?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  let timedOut = false;
  const timeout = () => {
    timedOut = true;
    controller.abort();
  };
  const total = setTimeout(timeout, TURN_LIMITS.totalMs);
  let phase = setTimeout(timeout, TURN_LIMITS.connectMs);
  return {
    signal: controller.signal,
    activity() {
      clearTimeout(phase);
      phase = setTimeout(timeout, TURN_LIMITS.idleMs);
    },
    async wait<T>(work: Promise<T>): Promise<T> {
      if (controller.signal.aborted) {
        void work.catch(() => {});
        throw new AssistantBriefingError(timedOut ? 'timed_out' : 'network_error', true);
      }
      let abort: () => void = () => {};
      try {
        return await Promise.race([
          work,
          new Promise<never>((_, reject) => {
            abort = () =>
              reject(new AssistantBriefingError(timedOut ? 'timed_out' : 'network_error', true));
            controller.signal.addEventListener('abort', abort, { once: true });
          }),
        ]);
      } finally {
        controller.signal.removeEventListener('abort', abort);
      }
    },
    close() {
      clearTimeout(total);
      clearTimeout(phase);
      signal?.removeEventListener('abort', cancel);
      controller.abort();
    },
  };
}
export type AssistantDelivery = ReturnType<typeof assistantDelivery>;

/** Frame ids are mandatory for the turn protocol; legacy briefing frames may omit them. */
export async function* assistantFrames(
  body: ReadableStream<Uint8Array>,
  delivery?: AssistantDelivery,
  requireIds = false
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let lastId = 0;
  let hasIds: boolean | undefined;
  try {
    for (;;) {
      const next = reader.read();
      const { done, value } = delivery ? await delivery.wait(next) : await next;
      if (!done) delivery?.activity();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (utf8Bytes(block) > TURN_LIMITS.frameBytes) throw malformedStream();
        const data: string[] = [];
        let event: string | undefined;
        let id: string | undefined;
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith(':')) continue;
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          const text = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'data') data.push(text);
          if (field === 'event') {
            if (event !== undefined) throw malformedStream();
            event = text;
          }
          if (field === 'id') {
            if (id !== undefined) throw malformedStream();
            id = text;
          }
        }
        if (data.length) {
          hasIds ??= id !== undefined;
          if (requireIds || hasIds || id !== undefined) {
            if (
              !id ||
              !/^[1-9]\d*$/.test(id) ||
              Number(id) !== lastId + 1 ||
              !Number.isSafeInteger(Number(id))
            )
              throw malformedStream();
            lastId = Number(id);
          }
          let json: unknown;
          try {
            json = JSON.parse(data.join('\n'));
          } catch {
            throw malformedStream();
          }
          if (
            !json ||
            typeof json !== 'object' ||
            !('type' in json) ||
            (event !== undefined && event !== json.type)
          )
            throw malformedStream();
          if ('protocol' in json && json.protocol === 'fluent-turn-v1' && id === undefined)
            throw malformedStream();
          yield json;
        }
        boundary = /\r?\n\r?\n/.exec(buffer);
      }
      if (utf8Bytes(buffer) > TURN_LIMITS.frameBytes) throw malformedStream();
      if (done) break;
    }
    if (buffer.trim()) throw new AssistantBriefingError('stream_incomplete', true);
  } catch (error) {
    if (error instanceof AssistantBriefingError) throw error;
    throw malformedStream();
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Error responses are bounded too; arbitrary HTTP bodies never become visible output. */
export async function assistantResponseJson(
  response: Response,
  delivery?: AssistantDelivery
): Promise<unknown> {
  if (!response.body) throw malformedStream();
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let bytes = 0;
  try {
    for (;;) {
      const pending = reader.read();
      const { done, value } = delivery ? await delivery.wait(pending) : await pending;
      if (done) break;
      bytes += value.byteLength;
      if (bytes > TURN_LIMITS.frameBytes) throw malformedStream();
      body += decoder.decode(value, { stream: true });
      delivery?.activity();
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
