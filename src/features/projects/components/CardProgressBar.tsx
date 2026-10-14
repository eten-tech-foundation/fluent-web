import React from 'react';

import { ProgressBarTrack } from '@/features/projects/components/ProgressBarTrack';
import useProgressBar, { formatProgressPercentage } from '@/features/projects/hooks/useProgressBar';
import { type ChapterStatusCounts, type WorkflowStep } from '@/lib/types';

interface CardProgressBarProps {
  chapterStatusCounts: ChapterStatusCounts;
  workflowConfig: WorkflowStep[];
  hideLegend?: boolean;
  variant?: 'default' | 'mini';
}

export const CardProgressBar: React.FC<CardProgressBarProps> = ({
  chapterStatusCounts,
  workflowConfig,
  hideLegend,
  variant = 'default',
}) => {
  const { legendItems, calculateProgressSegments, calculateOverallProgress } =
    useProgressBar(workflowConfig);
  const segments = calculateProgressSegments(chapterStatusCounts);

  const totalProgressPercentage = calculateOverallProgress(chapterStatusCounts);
  const totalCount = Object.values(chapterStatusCounts).reduce(
    (sum, count) => sum + Number(count),
    0
  );

  if (variant === 'mini') {
    return (
      <div className='flex items-center gap-2'>
        <ProgressBarTrack showEmptyTooltip className='h-1.5 w-16' segments={segments} />
        <span className='text-xs font-medium text-slate-500'>
          {formatProgressPercentage(totalProgressPercentage, totalCount)}
        </span>
      </div>
    );
  }

  return (
    <div className='flex w-full flex-col gap-3'>
      <ProgressBarTrack showEmptyTooltip className='h-2.5 w-full' segments={segments} />

      {!hideLegend && (
        <div className='grid grid-cols-2 gap-x-8 gap-y-2 pt-1'>
          {legendItems.map(item => (
            <div key={item.key} className='flex items-center gap-2'>
              <div
                className='h-4 w-4 shrink-0 rounded-none'
                style={{ backgroundColor: item.color }}
              />
              <span className='text-muted-foreground text-xs'>{item.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
