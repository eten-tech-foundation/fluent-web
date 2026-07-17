import React from 'react';

import { BookText, ChevronLeft, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getStatusDisplay } from '@/lib/formatters';
import {
  type ChapterAssignmentStatus as ChapterAssignmentStatusType,
  type ProjectItem,
} from '@/lib/types';

interface DraftingHeaderProps {
  projectItem: ProjectItem;
  readOnly: boolean;
  showResources: boolean;
  isAnythingSaving: boolean;
  hasAnyError: boolean;
  progressPercentage: number;
  isTranslationComplete: boolean;
  isComplete: boolean;
  isDraft: boolean;
  buttonText: string | undefined;
  activeFindingsCount?: number;
  onBack: () => void;
  onToggleResources: () => void;
  onSubmit: () => Promise<void>;
}

export const DraftingHeader: React.FC<DraftingHeaderProps> = ({
  projectItem,
  readOnly,
  showResources,
  isAnythingSaving,
  hasAnyError,
  progressPercentage,
  isTranslationComplete,
  isComplete,
  isDraft,
  buttonText,
  activeFindingsCount,
  onBack,
  onToggleResources,
  onSubmit,
}) => {
  const { t } = useTranslation();

  const backButton = (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={t('back', 'Back')}
            className='focus-visible:ring-primary flex shrink-0 cursor-pointer items-center rounded-xs border-none bg-transparent p-0 outline-hidden focus-visible:ring-2'
            onClick={onBack}
          >
            <ChevronLeft className='shrink-0' size={'24px'} strokeWidth={'2px'} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          align='start'
          className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
          side='top'
        >
          {t('back', 'Back')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className='shrink-0'>
      <div className='flex items-center justify-between py-4 pr-0.5'>
        <div className='flex shrink-0 items-center gap-4'>
          {backButton}
          <h2 className='text-3xl font-bold'>
            {projectItem.book} {projectItem.chapterNumber}
          </h2>
          <Badge
            className='rounded-full border-2 px-3 py-1 text-sm font-bold whitespace-nowrap text-(--text-disabled)'
            variant='outline'
          >
            {getStatusDisplay(projectItem.chapterStatus as ChapterAssignmentStatusType)}
          </Badge>
        </div>

        {!readOnly && (
          <div className='flex flex-1 items-center justify-end gap-4'>
            <div className='flex items-center gap-2'>
              {isAnythingSaving && <Loader className='text-primary h-4 w-4 animate-spin' />}
              {hasAnyError && (
                <span className='text-sm text-red-500'>
                  {t('autoSaveFailed', 'Auto-save failed')}
                </span>
              )}
            </div>

            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-pressed={showResources}
                    className='bg-primary relative flex cursor-pointer items-center gap-2'
                    type='button'
                    onClick={onToggleResources}
                  >
                    <BookText color='#ffffff' />
                    {activeFindingsCount !== undefined && activeFindingsCount > 0 && (
                      <span className='absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 ring-2 ring-white'></span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  align='start'
                  className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
                  side='top'
                >
                  {showResources
                    ? t('hideResources', 'Hide Resources')
                    : t('showResources', 'Show Resources')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {!isComplete && isDraft && (
              <div className='bg-input rounded-lg border sm:w-40 md:w-50 lg:w-76 xl:w-105'>
                <div className='h-4 overflow-hidden rounded-full'>
                  <div
                    className='bg-primary h-full rounded-full transition-all duration-300'
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>
            )}

            {!isComplete && (
              <Button
                className={`shrink-0 px-6 py-2 font-medium transition-all ${
                  isTranslationComplete
                    ? 'bg-primary hover:bg-primary-hover cursor-pointer text-white'
                    : 'cursor-not-allowed bg-gray-300 text-gray-500'
                }`}
                disabled={!isTranslationComplete}
                onClick={onSubmit}
              >
                {buttonText}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
