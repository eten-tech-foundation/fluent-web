import React from 'react';

import { Loader2, Sparkles } from 'lucide-react';

interface AiSuggestionPanelProps {
  suggestion: string | null | undefined;
  isLoading?: boolean;
  isError?: boolean;
}

export const AiSuggestionPanel: React.FC<AiSuggestionPanelProps> = ({
  suggestion,
  isLoading,
  isError,
}) => {
  return (
    <div className='mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/30'>
      <div className='mb-2 flex items-center gap-1.5'>
        <Sparkles aria-hidden='true' className='h-3.5 w-3.5 text-[#0B50D0] dark:text-blue-400' />
        <span className='text-xs font-semibold tracking-wide text-[#0B50D0] uppercase dark:text-blue-400'>
          AI Suggestion
        </span>
      </div>

      {isLoading && (
        <div className='flex items-center gap-2 text-sm text-gray-500' role='status'>
          <Loader2 aria-hidden='true' className='h-4 w-4 animate-spin' />
          <span>Generating suggestion…</span>
        </div>
      )}

      {!isLoading && isError && (
        <p className='text-sm text-red-500 dark:text-red-400'>
          Unable to load AI suggestion. Please try again later.
        </p>
      )}

      {!isLoading && !isError && !suggestion && (
        <p className='text-sm text-gray-500 dark:text-gray-400'>
          No AI translation suggestion is available for this verse yet.
        </p>
      )}

      {!isLoading && !isError && suggestion && (
        <p className='text-sm leading-relaxed text-gray-800 dark:text-gray-200'>{suggestion}</p>
      )}
    </div>
  );
};
