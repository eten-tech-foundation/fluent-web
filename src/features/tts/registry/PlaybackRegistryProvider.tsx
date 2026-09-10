import { type PropsWithChildren, useEffect, useRef, useState } from 'react';

import { PlaybackRegistryContext } from './PlaybackRegistryContext';
import { PlaybackRegistryStore } from './PlaybackRegistryStore';

export function PlaybackRegistryProvider({ children }: PropsWithChildren): React.JSX.Element {
  // Only the claim list is a ref. Observable data lives in the reducer-backed
  // store, with useSyncExternalStore delivering updates to each interested key.
  const claimants = useRef(new Set<() => void>());
  const [registry] = useState(() => new PlaybackRegistryStore(claimants.current));

  useEffect(() => () => registry.silenceAll(), [registry]);

  return (
    <PlaybackRegistryContext.Provider value={registry}>{children}</PlaybackRegistryContext.Provider>
  );
}
