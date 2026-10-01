import React from 'react';

import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ViewPageHeaderProps {
  title: string;
  onBack?: () => void;
  rightContent?: React.ReactNode;
}

export const ViewPageHeader: React.FC<ViewPageHeaderProps> = ({ title, onBack, rightContent }) => {
  const { t } = useTranslation();

  return (
    <div className='mb-4 flex items-center justify-between gap-3 sm:mb-6 sm:gap-4'>
      <div className='flex min-w-0 flex-1 items-center gap-3 sm:gap-4'>
        {onBack && (
          <button
            aria-label={t('back', 'Back')}
            className='hover:bg-hover focus-visible:ring-ring flex-shrink-0 cursor-pointer rounded-md p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none'
            type='button'
            onClick={onBack}
          >
            <ChevronLeft size='24px' strokeWidth='2px' />
          </button>
        )}
        <h1 className='text-foreground max-w-[80%] cursor-default truncate text-2xl font-semibold sm:text-2xl lg:text-3xl'>
          {title}
        </h1>
      </div>
      {rightContent && <div className='flex flex-shrink-0 items-center gap-2'>{rightContent}</div>}
    </div>
  );
};
