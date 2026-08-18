import React from 'react';

import { useTranslation } from 'react-i18next';

import { DisplayModeToggle } from '@/components/DisplayModeToggle';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AiTranslationSettings } from '@/features/ai-translation/components/AiTranslationSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-[500px]'>
        <DialogHeader>
          <DialogTitle>{t('settings', 'Settings')}</DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-4'>
          <DisplayModeToggle />

          {/* Card 2: Light/Dark Mode (sized to the same width as the Display card above) */}
          <ThemeToggle />

          <AiTranslationSettings />
        </div>
      </DialogContent>
    </Dialog>
  );
};
