import { useCallback, useSyncExternalStore } from 'react';

import { type PlayableKey } from '../seam/types';

import { EMPTY_PLAYABLE_STATE, type PlayableState } from './playbackRegistryState';
import { usePlaybackRegistry } from './usePlaybackRegistry';

const getServerSnapshot = (): PlayableState => EMPTY_PLAYABLE_STATE;

export function usePlayableState(key: PlayableKey): PlayableState {
  const registry = usePlaybackRegistry();
  const subscribe = useCallback(
    (listener: () => void) => registry.subscribe(key, listener),
    [registry, key]
  );
  const getSnapshot = useCallback(() => registry.getSnapshot(key), [registry, key]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
