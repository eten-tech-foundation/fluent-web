import React, { useState, useEffect } from 'react';

import { useLocation, useSearch } from '@tanstack/react-router';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { useToggleChapterAi } from '@/features/bible/hooks/useToggleChapterAi';
import { ChapterAssignmentStatus, UserRole } from '@/lib/types';
import { useAppStore } from '@/store/store';

export const AiTranslationSettings: React.FC = () => {
  const { currentProjectItem, setCurrentProjectItem, userdetail } = useAppStore();
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

  useEffect(() => {
    if (currentProjectItem?.isAiEnabled !== undefined) {
      setLocalAiState(currentProjectItem.isAiEnabled);
    }
  }, [currentProjectItem?.isAiEnabled]);

  const location = useLocation();
  const isTranslationView = location.pathname.startsWith('/translation');
  const { openAiInfo } = useSearch({ from: '__root__' });

  const isTranslator = userdetail?.role === UserRole.TRANSLATOR;
  const isDraftingStage = currentProjectItem?.chapterStatus === ChapterAssignmentStatus.DRAFT;

  if (!isTranslator || !isDraftingStage || !isTranslationView) {
    return null;
  }

  return (
    <>
      <div className='border-primary bg-background flex w-full items-center justify-between rounded-[12px] border p-4 shadow-sm'>
        <span className='text-foreground text-sm font-semibold'>AI Translation Suggestions</span>
        <Switch checked={localAiState} disabled={isPending} onCheckedChange={handleToggleAi} />
      </div>
      <Accordion
        collapsible
        className='border-y pt-2'
        defaultValue={openAiInfo ? 'ai' : undefined}
        type='single'
      >
        <AccordionItem className='border-none' value='ai'>
          <AccordionTrigger className='py-2 text-xl font-semibold hover:no-underline'>
            What are AI translation suggestions?
          </AccordionTrigger>

          <AccordionContent className='text-base leading-7'>
            <p className='mb-4'>
              A minimum of 500 verses is needed to show translation suggestions. Once that threshold
              is met, AI translation suggestions will automatically appear for each new verse.
            </p>
            <p>
              Keep in mind that this feature is still in development. It is advised to double check
              the suggestions and make adjustments as needed. Since data is sent to an external AI
              model, be sure to read the privacy policy before using this feature.
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
    </>
  );
};
