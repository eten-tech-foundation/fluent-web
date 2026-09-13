import { useTranslation } from 'react-i18next';

import { formatClock } from '../lib/formatClock';

export interface TimeReadoutProps {
  /** Segment-local elapsed sum; marked estimates fill unmeasured prior segments. */
  elapsed: number | null;
  estimated?: boolean;
}

export const TimeReadout = ({ elapsed, estimated = false }: TimeReadoutProps) => {
  const { t } = useTranslation();
  // Total-time display remains open: never estimate a total. Estimated elapsed
  // is subtly muted, not prefixed, and never announced on every timeupdate.
  return (
    <span
      aria-label={
        estimated
          ? t('tts.estimatedPlaybackTime', 'Estimated elapsed audio time')
          : t('tts.playbackTime', 'Audio playback time')
      }
      aria-live='off'
      className={`shrink-0 text-xs whitespace-nowrap tabular-nums ${estimated ? 'text-muted-foreground' : 'text-foreground'}`}
      data-estimated={estimated || undefined}
      role='timer'
    >
      {formatClock(elapsed)} / --:--
    </span>
  );
};
