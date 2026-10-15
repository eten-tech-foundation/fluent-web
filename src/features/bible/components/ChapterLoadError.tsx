import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

/** The failed loader must not expose an empty, editable chapter. */
export function ChapterLoadError() {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col items-center gap-4 p-8' role='alert'>
      <p>{t('chapterLoadFailed', 'Refresh the page to try again.')}</p>
      <Button onClick={() => window.location.reload()}>{t('refresh', 'Refresh')}</Button>
    </div>
  );
}
