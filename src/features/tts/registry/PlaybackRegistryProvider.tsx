import { type PropsWithChildren, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useHideAudio } from '../settings/useHideAudio';

import { PlaybackRegistryContext } from './PlaybackRegistryContext';
import { PlaybackRegistryStore } from './PlaybackRegistryStore';

export function PlaybackRegistryProvider({ children }: PropsWithChildren): React.JSX.Element {
  // Only the claim list is a ref. Observable data lives in the reducer-backed
  // store, with useSyncExternalStore delivering updates to each interested key.
  const claimants = useRef(new Set<() => void>());
  const [registry] = useState(() => new PlaybackRegistryStore(claimants.current));
  const [hidden] = useHideAudio();
  const previousHidden = useRef(hidden);

  useLayoutEffect(() => {
    const wasHidden = previousHidden.current;
    previousHidden.current = hidden;
    // The three silence-all callers are Hide Audio, the pause shortcut, and a
    // source-Bible change. They all use the registry's one claimant loop. Layout
    // timing records the pause before a host's passive disabled cleanup runs.
    if (!wasHidden && hidden) registry.silenceAll();
  }, [hidden, registry]);

  useEffect(() => () => registry.silenceAll(), [registry]);

  return (
    <PlaybackRegistryContext.Provider value={registry}>{children}</PlaybackRegistryContext.Provider>
  );
}
