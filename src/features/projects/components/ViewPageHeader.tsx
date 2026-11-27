import React from 'react';

import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

interface ViewPageHeaderProps {
  title: string;
  /** A line under the title, such as the counts on an organization's page. */
  subtitle?: React.ReactNode;
  onBack?: () => void;
  rightContent?: React.ReactNode;
}

export const ViewPageHeader: React.FC<ViewPageHeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightContent,
}) => {
  const { t } = useTranslation();

  const heading = (
    <h1 className='text-foreground max-w-[80%] cursor-default truncate text-2xl font-semibold sm:text-2xl lg:text-3xl'>
      {title}
    </h1>
  );

  return (
    <div className='mb-4 flex items-center justify-between gap-3 sm:mb-6 sm:gap-4'>
      <div
        className={cn(
          'flex min-w-0 flex-1 gap-3 sm:gap-4',
          subtitle ? 'items-start' : 'items-center'
        )}
      >
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
        {subtitle ? (
          <div className='min-w-0 flex-1'>
            {heading}
            <p className='text-muted-foreground mt-1 text-sm'>{subtitle}</p>
          </div>
        ) : (
          heading
        )}
      </div>
      {rightContent && <div className='flex flex-shrink-0 items-center gap-2'>{rightContent}</div>}
    </div>
  );
};
