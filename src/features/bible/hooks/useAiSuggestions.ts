import { useCallback, useEffect, useRef, useState } from 'react';

import { useMutation } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

interface AiSuggestion {
  bibleTextId: number;
  suggestedText: string;
  modelInfo?: string | null;
}

// Custom hook that orchestrates the "Stay Ahead" workflow on the frontend.
// It silently queues upcoming verses in the background when the drafter moves,
// and periodically polls the API to fetch completed AI translations.
export function useAiSuggestions(
  projectUnitId: number,
  bibleId: number,
  bookCode: string,
  chapterNumber: number,
  verseMapping: Record<number, number>, // bibleTextId -> verseNumber
  activeVerseNumber: number,
  isAiEnabled = false
) {
  const [suggestions, setSuggestions] = useState<Record<number, string>>({});
  const [isAiThresholdMet, setIsAiThresholdMet] = useState(false);
  const lastQueuedVerseRef = useRef<number>(-1);
  const hasCheckedThresholdRef = useRef(false);
  const currentChapterRef = useRef<number>(chapterNumber);

  // Reset refs when chapter changes
  if (currentChapterRef.current !== chapterNumber) {
    lastQueuedVerseRef.current = -1;
    hasCheckedThresholdRef.current = false;
    currentChapterRef.current = chapterNumber;
  }

  const fetchSuggestions = useCallback(async () => {
    if (!isAiEnabled) return;
    const bibleTextIds = Object.keys(verseMapping);
    if (bibleTextIds.length === 0) return;

    try {
      const idsStr = bibleTextIds.join(',');
      const url = `${config.api.url}/ai-suggestions?projectUnitId=${projectUnitId}&bibleTextIds=${idsStr}`;
      // eslint-disable-next-line no-console
      console.debug('[AI Suggestions] GET', {
        url,
        projectUnitId,
        bibleTextIdCount: bibleTextIds.length,
      });
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = (await res.json()) as { data: AiSuggestion[] };
        // eslint-disable-next-line no-console
        console.debug('[AI Suggestions] GET response', {
          status: res.status,
          suggestionsCount: data.data.length,
          data: data.data,
        });
        const newSuggestions: Record<number, string> = {};

        data.data.forEach((item: AiSuggestion) => {
          if (item.bibleTextId in verseMapping) {
            const vNum = verseMapping[item.bibleTextId];
            newSuggestions[vNum] = item.suggestedText;
          }
        });

        setSuggestions(prev => {
          // Only update if changed
          const isChanged = Object.entries(newSuggestions).some(([k, v]) => prev[Number(k)] !== v);
          if (isChanged) return { ...prev, ...newSuggestions };
          return prev;
        });
      } else {
        // eslint-disable-next-line no-console
        console.debug('[AI Suggestions] GET failed', {
          status: res.status,
          statusText: res.statusText,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch AI suggestions', e);
    }
  }, [projectUnitId, verseMapping, isAiEnabled]);

  // Initial fetch and polling
  useEffect(() => {
    if (!isAiEnabled) return;

    void fetchSuggestions();
    const interval = setInterval(() => {
      void fetchSuggestions();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchSuggestions, isAiEnabled]);

  // Queue next verses when active verse changes
  useEffect(() => {
    // If AI is disabled, we only want to ping the backend ONCE per chapter to discover if the threshold is met
    if (!isAiEnabled && hasCheckedThresholdRef.current) return;

    if (activeVerseNumber > lastQueuedVerseRef.current) {
      if (!isAiEnabled) {
        hasCheckedThresholdRef.current = true;
      }
      lastQueuedVerseRef.current = activeVerseNumber;

      const requestBody = {
        projectUnitId,
        bibleId,
        bookCode,
        chapterNumber,
        currentVerse: activeVerseNumber,
      };
      // eslint-disable-next-line no-console
      console.debug('[AI Suggestions] POST queue-next', requestBody);

      fetch(`${config.api.url}/ai-suggestions/queue-next`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
        .then(async res => {
          if (!res.ok) {
            const errorBody = await res.text().catch(() => 'no body');
            // eslint-disable-next-line no-console
            console.debug('[AI Suggestions] POST queue-next FAILED', {
              status: res.status,
              body: errorBody,
            });
          } else {
            // eslint-disable-next-line no-console
            console.debug('[AI Suggestions] POST queue-next OK', { status: res.status });
            const data = (await res.json().catch(() => null)) as { thresholdMet?: boolean } | null;
            if (data?.thresholdMet) {
              setIsAiThresholdMet(true);
            }
          }
        })
        .catch(e => {
          // eslint-disable-next-line no-console
          console.error('Failed to queue AI suggestions', e);
        });
    }
  }, [activeVerseNumber, projectUnitId, bibleId, bookCode, chapterNumber, isAiEnabled]);

  return { suggestions, isAiThresholdMet };
}

export const useTrackAiUsage = () => {
  return useMutation({
    mutationFn: async ({
      bibleTextId,
      projectUnitId,
      wasUsed,
    }: {
      bibleTextId: number;
      projectUnitId: number;
      wasUsed: boolean;
    }) => {
      const res = await fetch(`${config.api.url}/ai-suggestions/usage`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bibleTextId, projectUnitId, wasUsed }),
      });
      if (!res.ok) {
        throw new Error('Failed to track AI usage');
      }
    },
    onError: error => {
      Logger.logException(error, { context: 'Error tracking AI suggestion usage' });
    },
  });
};
