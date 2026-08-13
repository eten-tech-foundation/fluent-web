import { useCallback } from 'react';

import { useLocation, useNavigate } from '@tanstack/react-router';

import { showAiSuggestionToast } from '@/features/ai-translation/components/AiSuggestionToast';
import { useAppStore } from '@/store/store';

const getToastDismissedKey = (userId?: number) =>
  `ai-suggestion-toast-dismissed-${userId ?? 'unknown'}`;

export function useAiSuggestionToast() {
  const navigate = useNavigate();
  const location = useLocation();
  const userdetail = useAppStore(state => state.userdetail);

  return useCallback(
    (targetLanguageName: string) => {
      const toastKey = getToastDismissedKey(userdetail?.id);

      // Check if the user has already dismissed or interacted with this toast
      const hasDismissed = localStorage.getItem(toastKey) === 'true';
      if (hasDismissed) return;

      showAiSuggestionToast({
        targetLanguageName,

        onTellMeMore: () => {
          localStorage.setItem(toastKey, 'true');
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
          localStorage.setItem(toastKey, 'true');
        },
      });
    },
    [location.pathname, navigate, userdetail?.id]
  );
}
