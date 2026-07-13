import React, { useState } from 'react';

import { useTranslation } from 'react-i18next';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useToggleChapterAi } from '@/features/bible/hooks/useToggleChapterAi';
import { useAppStore } from '@/store/store';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { displayMode, setDisplayMode, currentProjectItem, setCurrentProjectItem } = useAppStore();
  const [localAiState, setLocalAiState] = useState(currentProjectItem?.isAiEnabled ?? false);

  const { mutate: toggleAi, isPending } = useToggleChapterAi(
    currentProjectItem?.chapterAssignmentId ?? 0,
    currentProjectItem?.projectId ?? 0
  );

  const handleToggleAi = (checked: boolean) => {
    setLocalAiState(checked);
    if (currentProjectItem) {
      setCurrentProjectItem({ ...currentProjectItem, isAiEnabled: checked });
      toggleAi(checked);
    }
  };

  // Sync local state when the modal opens or project item changes
  React.useEffect(() => {
    if (currentProjectItem?.isAiEnabled !== undefined) {
      setLocalAiState(currentProjectItem.isAiEnabled);
    }
  }, [currentProjectItem?.isAiEnabled, isOpen]);

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
          <div className='border-primary bg-background flex w-full items-center justify-between rounded-[12px] border p-4 shadow-sm'>
            <span className='text-foreground text-sm font-semibold'>
              AI Translation Suggestions
            </span>
            <Switch
              checked={localAiState}
              disabled={!currentProjectItem || isPending}
              onCheckedChange={handleToggleAi}
            />
          </div>
          <Accordion collapsible className='border-y pt-2' type='single'>
            <AccordionItem className='border-none' value='ai'>
              <AccordionTrigger className='py-2 text-xl font-semibold hover:no-underline'>
                What are AI translation suggestions?
              </AccordionTrigger>

              <AccordionContent className='text-base leading-7'>
                <p className='mb-4'>
                  A minimum of 500 verses is needed to show translation suggestions. Once that
                  threshold is met, AI translation suggestions will automatically appear for each
                  new verse.
                </p>
                <p>
                  Keep in mind that this feature is still in development. It is advised to double
                  check the suggestions and make adjustments as needed. Since data is sent to an
                  external AI model, be sure to read the privacy policy before using this feature.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <p className='text-sm'>
            See the{' '}
            <a className='text-[#0B50D0] hover:underline dark:text-blue-400' href='/legal/privacy'>
              Privacy Policy
            </a>{' '}
            and{' '}
            <a className='text-[#0B50D0] hover:underline dark:text-blue-400' href='/legal/terms'>
              Terms of Use
            </a>{' '}
            for more information.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
