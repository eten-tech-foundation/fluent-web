import React from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import useProgressBar from '@/features/projects/hooks/useProgressBar';
import { type ChapterStatusCounts, type WorkflowStep } from '@/lib/types';

interface CardProgressBarProps {
  chapterStatusCounts: ChapterStatusCounts;
  workflowConfig: WorkflowStep[];
  hideLegend?: boolean;
}

export const CardProgressBar: React.FC<CardProgressBarProps> = ({
  chapterStatusCounts,
  workflowConfig,
  hideLegend,
}) => {
  const { legendItems, calculateProgressSegments } = useProgressBar(workflowConfig);
  const segments = calculateProgressSegments(chapterStatusCounts);

  return (
    <div className='flex w-full flex-col gap-3'>
      <TooltipProvider delayDuration={200}>
        <div className='flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100'>
          {segments.map((segment, index) => (
            <Tooltip key={`${segment.status}-${index}`}>
              <TooltipTrigger asChild>
                <div
                  className='h-full first:rounded-l-full last:rounded-r-full hover:brightness-110'
                  style={{
                    width: `${segment.widthPercentage}%`,
                    backgroundColor: segment.color,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent side='top'>
                <p>
                  {segment.count} {segment.displayName}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

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
