import React from 'react';

import { ChevronLeft } from 'lucide-react';

interface ViewPageHeaderProps {
  title: string;
  onBack?: () => void;
  rightContent?: React.ReactNode;
}

export const ViewPageHeader: React.FC<ViewPageHeaderProps> = ({ title, onBack, rightContent }) => {
  return (
    <div className='mb-4 flex items-center justify-between gap-3 sm:mb-6 sm:gap-4'>
      <div className='flex min-w-0 flex-1 items-center gap-3 sm:gap-4'>
        <ChevronLeft
          className='flex-shrink-0 cursor-pointer'
          size={'24px'}
          strokeWidth={'2px'}
          onClick={onBack}
        />
        <h1 className='text-foreground max-w-[80%] cursor-default truncate text-2xl font-semibold sm:text-2xl lg:text-3xl'>
          {title}
        </h1>
      </div>
      {rightContent && <div className='flex flex-shrink-0 items-center gap-2'>{rightContent}</div>}
    </div>
  );
};
