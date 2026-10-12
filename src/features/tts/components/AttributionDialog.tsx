import type { ReactElement } from 'react';

import { useTranslation } from 'react-i18next';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { recordedNoticeKey, type RecordedNoticeAcknowledgment } from '../lib/ackStore';

import { RecordedNoticeAttribution } from './RecordedNoticeAttribution';

export interface AttributionDialogProps {
  entries: readonly RecordedNoticeAcknowledgment[];
  open: boolean;
  trigger: ReactElement;
  onOpenChange: (open: boolean) => void;
}

/** Reopens the notices for recordings acknowledged on this device. */
export function AttributionDialog({
  entries,
  open,
  trigger,
  onOpenChange,
}: AttributionDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('audioSourcesTitle', 'Audio sources & licences')}</DialogTitle>
          <DialogDescription>
            {t('audioSourcesDescription', 'Recording information saved on this device.')}
          </DialogDescription>
        </DialogHeader>
        {entries.length === 0 ? (
          <p className='text-sm'>
            {t('audioSourcesEmpty', 'No audio sources have been played on this device yet.')}
          </p>
        ) : (
          <ul className='max-h-[50vh] space-y-4 overflow-y-auto text-sm'>
            {entries.map(({ notice }) => (
              <li
                key={recordedNoticeKey(notice)}
                className='space-y-1 border-b pb-4 last:border-b-0'
              >
                <RecordedNoticeAttribution notice={notice} />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
