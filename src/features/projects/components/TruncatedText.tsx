import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTruncation } from '@/features/projects/hooks/useTruncation';

export const TruncatedTableText = ({ text }: { text: string }): React.JSX.Element => {
  const { ref, isTruncated } = useTruncation<HTMLDivElement>(text);

  const content = (
    <div ref={ref} className='max-w-full cursor-default truncate' title=''>
      {text}
    </div>
  );

  if (!isTruncated) return content;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent
          align='center'
          className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
          side='top'
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const TruncatedCardText = ({ text }: { text: string }): React.JSX.Element => {
  const { ref, isTruncated } = useTruncation<HTMLDivElement>(text);

  const content = (
    <div
      ref={ref}
      className='max-w-full cursor-default truncate text-base font-medium text-gray-600 dark:text-gray-400'
    >
      {text}
    </div>
  );

  if (!isTruncated) return content;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent
          align='center'
          className='bg-popover text-popover-foreground border-border max-w-[350px] rounded-md border px-4 py-2.5 text-sm font-semibold break-all shadow-lg'
          side='bottom'
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
