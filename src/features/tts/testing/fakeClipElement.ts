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
  /**
   * `src` value at each `play()` call. Recovery has to RESTART playback, not
   * merely re-point the element: `load()` leaves it paused, and `play()` is the
   * only audible trigger. Without this counter that distinction is invisible to
   * every test, which is how a ladder that never resumed anything stayed green.
   */
  playCalls: string[] = [];
  /**
   * Rejection for the next `play()`, if any. A real element rejects this
   * promise for two very different reasons — autoplay refusal and a source
   * that failed to load — and until phase 09 this fake could only resolve, so
   * the queue's handling of a rejected `play()` was never exercised at all.
   * That is the hole a live 404 fell through.
   */
  playRejection?: unknown;
  private listeners = new Map<string, Set<() => void>>();

  load(): void {
    this.loadCalls.push(this.src);
  }
  play(): Promise<void> {
    this.playCalls.push(this.src);
    return this.playRejection === undefined
      ? Promise.resolve()
      : Promise.reject(this.playRejection);
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
