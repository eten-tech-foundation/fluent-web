/**
 * Per-device audio visibility, intentionally kept out of `/self/settings`.
 * That endpoint is replaced with a full PUT, so using it for a device-local
 * preference could overwrite unrelated account settings from a stale client.
 */
export const HIDE_AUDIO_STORAGE_KEY = 'fluent.audio.hidden';

const listeners = new Set<() => void>();
let snapshot: boolean | undefined;

const readStorage = (): boolean | undefined => {
  try {
    return globalThis.localStorage.getItem(HIDE_AUDIO_STORAGE_KEY) === 'true';
  } catch {
    return undefined;
  }
};

/** Current hidden state. Its value remains usable in memory when storage is unavailable. */
export const readHideAudio = (): boolean => {
  snapshot ??= readStorage() ?? false;
  return snapshot;
};

/** Subscribe to changes for `useSyncExternalStore`. */
export const subscribeHideAudio = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notify = (): void => {
  for (const listener of listeners) listener();
};

/** Set the per-device preference; showing controls removes all storage residue. */
export const setHideAudio = (hidden: boolean): void => {
  const previous = readHideAudio();
  snapshot = hidden;
  try {
    if (hidden) globalThis.localStorage.setItem(HIDE_AUDIO_STORAGE_KEY, 'true');
    else globalThis.localStorage.removeItem(HIDE_AUDIO_STORAGE_KEY);
  } catch {
    // Private/denied/full storage still keeps this session's in-memory choice.
  }
  if (previous !== hidden) notify();
};

/** Re-read a cross-tab change without discarding a usable in-memory fallback. */
export const refreshHideAudio = (): void => {
  const next = readStorage();
  if (next === undefined) return;
  const previous = readHideAudio();
  snapshot = next;
  if (previous !== next) notify();
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === null || event.key === HIDE_AUDIO_STORAGE_KEY) refreshHideAudio();
  });
}
