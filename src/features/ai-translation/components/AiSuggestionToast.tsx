import React from 'react';

import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const TOAST_ID = 'ai-suggestion-onboarding';

// ─── Inner content ────────────────────────────────────────────────────────────

interface AiSuggestionToastContentProps {
  targetLanguageName: string;
  onTellMeMore: () => void;
  onDismiss: () => void;
}

export const AiSuggestionToastContent: React.FC<AiSuggestionToastContentProps> = ({
  targetLanguageName,
  onTellMeMore,
  onDismiss,
}) => {
  const { t } = useTranslation();

  return (
    <div className='border-border bg-background relative flex w-full items-center gap-4 rounded-xl border px-5 py-4 shadow-lg sm:w-full sm:max-w-xl'>
      {/* Text block */}
      <div className='min-w-0 flex-1'>
        <p className='text-foreground text-sm leading-snug font-bold sm:whitespace-nowrap'>
          <Trans
            defaults='AI Suggestions now available for {{targetLanguageName}}!'
            i18nKey='aiSuggestionsAvailable'
            values={{ targetLanguageName }}
          />
        </p>
        <p className='text-muted-foreground mt-0.5 text-sm'>
          {t('aiSuggestionsMoreInfo', 'You can view more information later in the Settings menu.')}
        </p>
      </div>

      {/* "Tell me more" outlined button */}
      <button
        className='border-primary text-primary hover:bg-primary/10 focus-visible:outline-primary flex-shrink-0 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
        type='button'
        onClick={onTellMeMore}
      >
        {t('tellMeMore', 'Tell me more')}
      </button>

      {/* X close button — top-right */}
      <button
        aria-label={t('dismiss', 'Dismiss')}
        className='text-muted-foreground hover:bg-muted hover:text-foreground absolute top-3 right-3 rounded p-0.5 transition-colors'
        type='button'
        onClick={onDismiss}
      >
        <svg
          className='h-3.5 w-3.5'
          fill='none'
          stroke='currentColor'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth='2'
          viewBox='0 0 24 24'
          xmlns='http://www.w3.org/2000/svg'
        >
          <line x1='18' x2='6' y1='6' y2='18' />
          <line x1='6' x2='18' y1='6' y2='18' />
        </svg>
      </button>
    </div>
  );
};

// ─── Function that fires the toast ───────────────────────────────────────────

interface ShowAiSuggestionToastOptions {
  targetLanguageName: string;
  onTellMeMore: () => void;
  onDismiss: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export function showAiSuggestionToast({
  targetLanguageName,
  onTellMeMore,
  onDismiss,
}: ShowAiSuggestionToastOptions): void {
  const handleDismiss = (): void => {
    toast.dismiss(TOAST_ID);
    onDismiss();
  };

  const handleTellMeMore = (): void => {
    toast.dismiss(TOAST_ID);
    onTellMeMore();
  };

  toast.custom(
    () => (
      <AiSuggestionToastContent
        targetLanguageName={targetLanguageName}
        onDismiss={handleDismiss}
        onTellMeMore={handleTellMeMore}
      />
    ),
    {
      id: TOAST_ID,
      duration: Infinity,
      closeButton: false,
      style: { width: '100%', maxWidth: '600px' },
    }
  );
}
