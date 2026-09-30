import React, { useEffect, useState } from 'react';

import { useLocation, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { useToggleChapterAi } from '@/features/bible/hooks/useToggleChapterAi';
import { ChapterAssignmentStatus, ROLES } from '@/lib/types';
import { useAppStore } from '@/store/store';

export const AiTranslationSettings: React.FC = () => {
  const {
    currentProjectItem,
    userdetail,
    isAiThresholdMet,
    isAiSyncPending,
    setIsAiSyncPending,
    setAiAutoEnablePreference,
  } = useAppStore();
  const [localAiState, setLocalAiState] = useState(currentProjectItem?.isAiEnabled ?? false);

  const { mutateAsync: toggleAi, isPending } = useToggleChapterAi(
    currentProjectItem?.chapterAssignmentId ?? 0,
    currentProjectItem?.projectId ?? 0
  );

  const handleToggleAi = async (checked: boolean) => {
    if (!currentProjectItem) return;
    setIsAiSyncPending(true);
    setLocalAiState(checked);
    const assignmentId = currentProjectItem.chapterAssignmentId;
    const previousState = currentProjectItem.isAiEnabled;
    const priorUserPreference = userdetail
      ? useAppStore.getState().aiAutoEnablePreferences[userdetail.id]
      : undefined;
    const updateCurrentAssignment = (isAiEnabled: boolean | undefined) => {
      const latest = useAppStore.getState();
      if (latest.currentProjectItem?.chapterAssignmentId !== assignmentId) return;
      latest.setCurrentProjectItem({
        ...latest.currentProjectItem,
        isAiEnabled,
      });
    };

    // Stop loading immediately on opt-out. Opt-in must wait for the server:
    // otherwise the first suggestion requests still see a disabled assignment.
    if (!checked) {
      if (userdetail) setAiAutoEnablePreference(userdetail.id, false);
      updateCurrentAssignment(false);
    }
    try {
      await toggleAi(checked);
      if (useAppStore.getState().userdetail?.id !== userdetail?.id) return;
      if (userdetail) setAiAutoEnablePreference(userdetail.id, checked);
      updateCurrentAssignment(checked);
    } catch {
      // The request can settle after Settings closes or navigation changes the
      // assignment. Never restore a captured project over the current one.
      if (useAppStore.getState().userdetail?.id !== userdetail?.id) return;
      if (useAppStore.getState().currentProjectItem?.chapterAssignmentId === assignmentId) {
        setLocalAiState(previousState ?? false);
      }
      if (userdetail) setAiAutoEnablePreference(userdetail.id, priorUserPreference);
      updateCurrentAssignment(previousState);
      toast.error('Could not update AI translation suggestions. Please try again.');
    } finally {
      setIsAiSyncPending(false);
    }
  };

  useEffect(() => {
    if (currentProjectItem?.isAiEnabled !== undefined) {
      setLocalAiState(currentProjectItem.isAiEnabled);
    }
  }, [currentProjectItem?.chapterAssignmentId, currentProjectItem?.isAiEnabled]);

  const location = useLocation();
  const isTranslationView = location.pathname.startsWith('/translation');
  const { openAiInfo } = useSearch({ from: '__root__' });

  const isTranslator = userdetail?.role === ROLES.PROJECT_TRANSLATOR;
  const isDraftingStage = currentProjectItem?.chapterStatus === ChapterAssignmentStatus.DRAFT;

  const renderContent = () => {
    switch (true) {
      case !isTranslator || !isDraftingStage || !isTranslationView:
        return null;

      case isAiThresholdMet === null:
        // Loading skeleton (matches the exact height/padding of the real one)
        return (
          <div className='border-primary bg-background flex w-full animate-pulse items-center justify-between rounded-[12px] border p-4 shadow-sm'>
            <div className='h-5 w-48 rounded bg-gray-200' />
            <div className='h-6 w-11 rounded-full bg-gray-200' />
          </div>
        );

      case isAiThresholdMet === false:
        return null;

      default:
        return (
          <div className='border-primary bg-background flex w-full items-center justify-between rounded-[12px] border p-4 shadow-sm'>
            <span className='text-foreground text-sm font-semibold'>
              AI Translation Suggestions
            </span>
            <Switch
              aria-label='AI Translation Suggestions'
              checked={localAiState}
              disabled={isPending || isAiSyncPending}
              onCheckedChange={handleToggleAi}
            />
          </div>
        );
    }
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <>
      {content}
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
              is met and this setting is enabled, AI translation suggestions will automatically
              appear for each new verse.
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
