import { assistantResponseJson, type AssistantDelivery } from './assistant.stream';
import { AssistantBriefingError } from './assistant.types';

const ADMISSION_WAIT_MS = 120_000;

/** Retry only an explicit HTTP admission refusal. Once SSE starts, nothing is replayed. */
export async function fetchWithAssistantAdmission(
  url: string,
  init: RequestInit,
  delivery: AssistantDelivery
): Promise<Response> {
  const deadline = Date.now() + ADMISSION_WAIT_MS;
  let retry = 0;
  for (;;) {
    if (delivery.signal.aborted) throw new AssistantBriefingError('network_error', true);
    const response = await delivery.wait(fetch(url, init));
    delivery.activity();
    if (response.status !== 429) return response;
    let body: unknown;
    try {
      body = await assistantResponseJson(response.clone(), delivery);
    } catch {
      return response;
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !('code' in body) ||
      body.code !== 'generation_busy' ||
      !('retryable' in body) ||
      body.retryable !== true
    )
      return response;
    const hint =
      'retryAfter' in body &&
      typeof body.retryAfter === 'number' &&
      Number.isFinite(body.retryAfter) &&
      body.retryAfter >= 0
        ? body.retryAfter * 1000
        : 1000;
    const delay = Math.max(hint, Math.min(10_000, 1000 * 2 ** Math.min(retry++, 4)));
    if (Date.now() + delay > deadline) return response;
    await response.body?.cancel();
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        delivery.signal.removeEventListener('abort', cancel);
        reject(new AssistantBriefingError('network_error', true));
      };
      const timer = setTimeout(() => {
        delivery.signal.removeEventListener('abort', cancel);
        resolve();
      }, delay);
      delivery.signal.addEventListener('abort', cancel, { once: true });
      if (delivery.signal.aborted) cancel();
    });
  }
}
