import React from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  formatProgressPercentage,
  type ProgressSegment,
} from '@/features/projects/hooks/useProgressBar';
import { cn } from '@/lib/ui/utils';

interface ProgressBarTrackProps {
  segments: ProgressSegment[];
  className?: string;
  showEmptyTooltip?: boolean;
}

export const ProgressBarTrack: React.FC<ProgressBarTrackProps> = ({
  segments,
  className,
  showEmptyTooltip = false,
}) => {
  if (segments.length === 0) {
    if (showEmptyTooltip) {
      return (
        <TooltipProvider disableHoverableContent delayDuration={100} skipDelayDuration={300}>
          <div className={cn('flex overflow-hidden rounded-full bg-slate-100', className)}>
            <Tooltip disableHoverableContent>
              <TooltipTrigger asChild>
                <div
                  aria-label='0% Not Started'
                  className='focus-visible:ring-ring h-full w-full cursor-pointer focus-visible:ring-1 focus-visible:outline-none'
                  role='img'
                  tabIndex={0}
                />
              </TooltipTrigger>
              <TooltipContent side='top'>
                <p>0% Not Started</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      );
    }
    return <div className={cn('bg-primary/10 w-full rounded-full', className)} />;
  }

  return (
    <TooltipProvider disableHoverableContent delayDuration={100} skipDelayDuration={300}>
      <div className={cn('flex w-full overflow-hidden rounded-full bg-slate-100', className)}>
        {segments.map((segment, index) => (
          <Tooltip key={`${segment.status}-${index}`} disableHoverableContent>
            <TooltipTrigger asChild>
              <div
                aria-label={`${formatProgressPercentage(segment.percentage, segment.count)} ${segment.displayName}`}
                className='focus-visible:ring-ring box-border h-full cursor-pointer border-r-2 border-white last:border-r-0 hover:brightness-110 focus-visible:ring-1 focus-visible:outline-none'
                role='img'
                style={{
                  width: `${segment.percentage}%`,
                  minWidth: segment.count > 0 ? '6px' : undefined,
                  flexShrink: 1,
                  backgroundColor: segment.color,
                }}
                tabIndex={0}
              />
            </TooltipTrigger>
            <TooltipContent side='top'>
              {segment.subSegments && segment.subSegments.length > 0 ? (
                <div className='flex flex-col gap-1'>
                  <p className='mb-1 border-b pb-1 font-bold'>
                    {formatProgressPercentage(segment.percentage, segment.count)}{' '}
                    {segment.displayName}
                  </p>
                  {segment.subSegments.map((sub, idx) => (
                    <p key={idx} className='text-xs'>
                      {sub.label}: {formatProgressPercentage(sub.percentage, sub.count)}
                    </p>
                  ))}
                </div>
              ) : (
                <p>
                  {formatProgressPercentage(segment.percentage, segment.count)}{' '}
                  {segment.displayName}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};
