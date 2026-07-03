import React from 'react';

import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAppStore } from '@/store/store';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { displayMode, setDisplayMode } = useAppStore();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>{t('settings', 'Settings')}</DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          {/* Card 1: Scripture Display */}
          <div className='border-primary bg-background flex w-full items-center justify-between rounded-[12px] border p-4 shadow-sm'>
            <span className='text-foreground text-sm font-semibold'>
              {t('scriptureDisplay', 'Scripture Display')}
            </span>
            <div className='border-primary bg-background flex h-9 items-center overflow-hidden rounded-full border'>
              <button
                className={`flex h-full items-center justify-center px-6 text-xs font-semibold transition-all hover:cursor-pointer ${
                  displayMode === 'verse'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-primary hover:bg-primary/10 bg-background'
                }`}
                type='button'
                onClick={() => setDisplayMode('verse')}
              >
                {t('verse', 'Verse')}
              </button>
              <div className='bg-primary h-full w-px' />
              <button
                className={`flex h-full items-center justify-center px-6 text-xs font-semibold transition-all hover:cursor-pointer ${
                  displayMode === 'pericope'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-primary hover:bg-primary/10 bg-background'
                }`}
                type='button'
                onClick={() => setDisplayMode('pericope')}
              >
                {t('pericope', 'Pericope')}
              </button>
            </div>
          </div>

          {/* Card 2: Light/Dark Mode (Sized to the same width as Scripture Display) */}
          <ThemeToggle />
        </div>
      </DialogContent>
    </Dialog>
  );
};
