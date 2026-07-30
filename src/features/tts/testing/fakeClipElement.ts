/**
 * Shared test fakes for the TTS feature (not exported from the feature index;
 * test-only). jsdom implements no media stack, so playback tests fabricate a
 * clip element with a manual event bus, and the engine/supervision take an
 * injected `fetchFn`, so HTTP responses are fabricated directly too.
 */
import { type ClipAudioElement } from '../lib/audioElement';

/** Fake media element with a manual event bus (jsdom has no media stack). */
export class FakeClipElement implements ClipAudioElement {
  src = '';
  preload = '';
  currentTime = 0;
  playbackRate = 1;
  /** `src` value at each `load()` call — the reload assertions read this. */
  loadCalls: string[] = [];
  private listeners = new Map<string, Set<() => void>>();

  load(): void {
    this.loadCalls.push(this.src);
  }
  play(): Promise<void> {
    return Promise.resolve();
  }
  pause(): void {}
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

export interface FakeResponseInit {
  status?: number;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
  type?: ResponseType;
}

/** Fabricate just enough of a `Response` for the injected-fetch seams. */
export const fakeResponse = (init: FakeResponseInit = {}): Response => {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    url: init.url ?? '',
    type: init.type ?? 'basic',
    headers: new Headers(init.headers ?? {}),
    json: () => Promise.resolve(init.body),
  } as unknown as Response;
};
