import { useLocation, useNavigate } from '@tanstack/react-router';

import { showAiSuggestionToast } from '@/features/ai-translation/components/AiSuggestionToast';

const AI_TOAST_DISMISSED_KEY = 'ai-suggestion-toast-dismissed';

export function useAiSuggestionToast() {
  const navigate = useNavigate();
  const location = useLocation();

  return (targetLanguageName: string) => {
    // Check if the user has already dismissed or interacted with this toast
    const hasDismissed = localStorage.getItem(AI_TOAST_DISMISSED_KEY) === 'true';
    if (hasDismissed) return;

    showAiSuggestionToast({
      targetLanguageName,

      onTellMeMore: () => {
        localStorage.setItem(AI_TOAST_DISMISSED_KEY, 'true');
        void navigate({
          to: location.pathname,
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            modal: 'settings' as const,
            openAiInfo: true,
          }),
          replace: true,
        });
      },
      onDismiss: () => {
        localStorage.setItem(AI_TOAST_DISMISSED_KEY, 'true');
      },
    });
  };
}
