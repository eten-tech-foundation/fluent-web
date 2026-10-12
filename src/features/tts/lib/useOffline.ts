import { useSyncExternalStore } from 'react';

// TTS is served live, never stored on device; recordings are hot-linked too.
// Browser connectivity therefore disables visible audio controls, not hides them.
// Offline requirement: Joel Mathew, 2026-08-10. The mobile Offline Tier 1
// manifest is not a web audio cache. Request failures must report errors, never
// change this signal: only browser events provide the corresponding wake-up.
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
const getSnapshot = () => typeof navigator !== 'undefined' && !navigator.onLine;
const getServerSnapshot = () => false;

const subscribe = (listener: () => void) => {
  if (typeof window === 'undefined') return () => {};
  if (listeners.size === 0) {
    window.addEventListener('online', notify);
    window.addEventListener('offline', notify);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('online', notify);
      window.removeEventListener('offline', notify);
    }
  };
};

/** One browser signal shared by all audio controls; no transport-failure latch. */
export const useOffline = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
