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

import { RecordedNoticeAttribution } from './RecordedNoticeAttribution';

import type { RecordedNotice } from '../lib/ackStore';

export interface RecordedNoticeDialogProps {
  notice: RecordedNotice | null;
  onClose: () => void;
}

/** A courtesy notice for an actual recording. The playback host holds audio while it is open. */
export function RecordedNoticeDialog({ notice, onClose }: RecordedNoticeDialogProps) {
  const { t } = useTranslation();
  if (!notice?.notice.trim()) return null;
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
          <RecordedNoticeAttribution notice={notice} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t('recordedAudioAcknowledge', 'Got it')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
