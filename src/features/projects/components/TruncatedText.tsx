import { useRef, useState } from 'react';

import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTruncation } from '@/features/projects/hooks/useTruncation';

export const wrapMilestoneName = (text: string, maxChars = 50): string[] => {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const rawWords = trimmed.split(/\s+/);
  const words: string[] = [];
  for (const w of rawWords) {
    if (w.length <= maxChars) {
      words.push(w);
    } else {
      for (let i = 0; i < w.length; i += maxChars) {
        words.push(w.slice(i, i + maxChars));
      }
    }
  }

  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (!currentLine) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxChars) {
      currentLine += ` ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

export const TruncatedMilestoneText = ({
  text,
  className = 'text-foreground block max-w-[200px] cursor-default truncate font-medium',
}: {
  text: string;
  className?: string;
}): React.JSX.Element => {
  const ref = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const lines = wrapMilestoneName(text);

  const handlePointerEnter = () => {
    const isEllipsed = ref.current
      ? ref.current.scrollWidth > ref.current.clientWidth || text.length > 25
      : text.length > 25;
    if (isEllipsed) {
      setIsOpen(true);
    }
  };

  const handlePointerLeave = () => {
    setIsOpen(false);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          <span
            ref={ref}
            className={className}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
          >
            {text}
          </span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            className='max-w-[420px] text-xs font-normal break-words'
            side='bottom'
            sideOffset={4}
          >
            <div className='flex flex-col gap-0.5'>
              {lines.map((line, idx) => (
                <span key={idx} className='block'>
                  {line}
                </span>
              ))}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
};

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
