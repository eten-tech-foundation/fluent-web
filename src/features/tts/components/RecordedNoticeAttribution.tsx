import { useTranslation } from 'react-i18next';

import type { RecordedNotice } from '../lib/ackStore';

export interface RecordedNoticeAttributionProps {
  notice: RecordedNotice;
}

const recordedProviderName = (provider: RecordedNotice['recordingProvider']): string =>
  provider === 'aquifer' ? 'Aquifer' : provider === 'dbl' ? 'API.Bible' : 'YouVersion';

/** Shared source and attribution rows; dialog state and rails remain with their hosts. */
export function RecordedNoticeAttribution({ notice }: RecordedNoticeAttributionProps) {
  const { t } = useTranslation();
  return (
    <>
      <p>
        <span className='font-semibold'>{t('recordedAudioTextSource', 'Text:')}</span>{' '}
        {notice.textBibleName}
      </p>
      <p>
        <span className='font-semibold'>{t('recordedAudioSource', 'Recording:')}</span>{' '}
        {recordedProviderName(notice.recordingProvider)}: {notice.recordingName}
      </p>
      <p className='break-words whitespace-pre-wrap'>{notice.notice}</p>
    </>
  );
}
