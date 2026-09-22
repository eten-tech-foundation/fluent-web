import { useFeatureFlag } from '@/features/flags';

import { useHideAudio } from './useHideAudio';

/**
 * Every surface that renders an audio control reads this hook and nothing else —
 * no per-surface toggle, ever.
 */
export const useAudioEnabled = (): boolean => {
  const sourceAudioEnabled = useFeatureFlag('sourceAudio');
  const [hidden] = useHideAudio();
  return sourceAudioEnabled && !hidden;
};
