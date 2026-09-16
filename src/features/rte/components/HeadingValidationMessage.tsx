import { useTranslation } from 'react-i18next';

import type { HeadingError } from '../lib/heading-markers';

export function HeadingValidationMessage({ error }: { error: HeadingError }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <p className='text-destructive px-6 py-2 text-sm' role='alert'>
      {error === 'count'
        ? t('headingCountError', 'Keep at most four headings before a verse to save your changes.')
        : t(
            'headingTextError',
            'To save your changes, keep each heading within 300 characters and remove backslashes or line breaks.'
          )}
    </p>
  );
}
