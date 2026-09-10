import { createContext } from 'react';

import { type PlaybackRegistry } from './PlaybackRegistryStore';

export const PlaybackRegistryContext = createContext<PlaybackRegistry | null>(null);
