import { useContext } from 'react';

import { PlaybackRegistryContext } from './PlaybackRegistryContext';
import { type PlaybackRegistry } from './PlaybackRegistryStore';

export function usePlaybackRegistry(): PlaybackRegistry {
  const registry = useContext(PlaybackRegistryContext);
  if (!registry) {
    throw new Error('Audio hosts must be inside PlaybackRegistryProvider');
  }
  return registry;
}
