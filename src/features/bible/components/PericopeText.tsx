import { useTranslation } from 'react-i18next';

interface PericopeTextProps {
  content?: string;
  testId?: string;
  isLoading?: boolean;
  isError?: boolean;
  emptyState?: 'unavailable' | 'not-drafted';
  className?: string;
}

/** Keep loaded text visible; placeholders share the same precedence across pericope panels. */
export const PericopeText = ({
  content,
  testId,
  isLoading = false,
  isError = false,
  emptyState = 'unavailable',
  className = '',
}: PericopeTextProps) => {
  const { t } = useTranslation();
  const unavailable = !content?.trim();
  const text = !unavailable
    ? content
    : isLoading
      ? t('loading', 'Loading...')
      : isError
        ? t('errorLoadingBibleContent', 'Unable to load Bible content.')
        : emptyState === 'not-drafted'
          ? t('pericopeNotDrafted', 'Not drafted')
          : t('noContentAvailable', 'No content available');

  return (
    <span
      className={`${className} ${unavailable ? 'text-muted-foreground text-sm' : ''}`.trim()}
      data-testid={testId}
    >
      {text}
    </span>
  );
};
