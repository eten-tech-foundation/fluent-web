import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { RecordedNotice } from '../lib/ackStore';

export interface RecordedNoticeDialogProps {
  notice: RecordedNotice | null;
  onClose: () => void;
}

/** A courtesy notice for an actual recording. The playback host holds audio while it is open. */
export function RecordedNoticeDialog({ notice, onClose }: RecordedNoticeDialogProps) {
  const { t } = useTranslation();
  if (!notice?.notice.trim()) return null;
  const provider =
    notice.recordingProvider === 'aquifer'
      ? 'Aquifer'
      : notice.recordingProvider === 'dbl'
        ? 'API.Bible'
        : 'YouVersion';
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('recordedAudioNoticeTitle', 'Recording information')}</DialogTitle>
          <DialogDescription>
            {t('recordedAudioNoticeDescription', 'Source information for this recording.')}
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[50vh] space-y-3 overflow-y-auto text-sm'>
          <p>
            <span className='font-semibold'>{t('recordedAudioTextSource', 'Text:')}</span>{' '}
            {notice.textBibleName}
          </p>
          <p>
            <span className='font-semibold'>{t('recordedAudioSource', 'Recording:')}</span>{' '}
            {provider}: {notice.recordingName}
          </p>
          <p className='break-words whitespace-pre-wrap'>{notice.notice}</p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t('recordedAudioAcknowledge', 'Got it')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
