import { useCallback, useSyncExternalStore } from 'react';

import { readHideAudio, setHideAudio, subscribeHideAudio } from './hideAudioStore';

/** Reactive access to the device-local Hide Audio preference. */
export const useHideAudio = (): [hidden: boolean, setHidden: (hidden: boolean) => void] => {
  const hidden = useSyncExternalStore(subscribeHideAudio, readHideAudio, () => false);
  const setHidden = useCallback((next: boolean) => setHideAudio(next), []);
  return [hidden, setHidden];
};
