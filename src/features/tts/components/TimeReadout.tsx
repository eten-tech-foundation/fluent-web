import { useTranslation } from 'react-i18next';

import { formatClock } from '../lib/formatClock';

export interface TimeReadoutProps {
  /** Exact, segment-local elapsed sum from the host; null means unknown. */
  elapsed: number | null;
}

export const TimeReadout = ({ elapsed }: TimeReadoutProps) => {
  const { t } = useTranslation();
  // S1 (total-time display) remains open: no estimated total. Unknown elapsed
  // also uses the placeholder, an explicit inference rather than invented time.
  return (
    <span
      aria-label={t('tts.playbackTime', 'Audio playback time')}
      aria-live='off'
      className='text-muted-foreground shrink-0 text-xs whitespace-nowrap tabular-nums'
      role='timer'
    >
      {formatClock(elapsed)} / --:--
    </span>
  );
};
