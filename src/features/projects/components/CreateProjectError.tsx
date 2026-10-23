import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { NetworkError } from '@/lib/api-utils';

/**
 * Why Create Project failed, for both tabs. The API's own reason is shown as is (a file it
 * cannot parse, a Source Bible without one of the books), and a request that never reached the
 * server says so, instead of the button quietly coming back (#419, #420).
 */
export function CreateProjectError({ error }: { error: Error }) {
  const { t } = useTranslation();
  const reason = error instanceof NetworkError ? t('errorCreateProjectNetwork') : error.message;

  return (
    <div
      className='flex items-start gap-2 rounded-sm border border-[#f5b5b5] bg-[#fde8e8] px-3.5 py-2.5 text-[13px] leading-normal text-[#b91c1c] dark:border-[#6b2b2b] dark:bg-[#3a1f1f] dark:text-[#f5a3a3]'
      data-testid='create-project-error'
      role='alert'
    >
      <TriangleAlert aria-hidden className='mt-0.5 h-4 w-4 shrink-0' />
      <div>
        <p className='font-medium'>{t('errorProjectNotCreated')}</p>
        <p>{reason}</p>
      </div>
    </div>
  );
}
