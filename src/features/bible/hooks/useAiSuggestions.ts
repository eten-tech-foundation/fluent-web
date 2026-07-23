import { useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { useAppStore } from '@/store/store';

interface AiSuggestion {
  bibleTextId: number;
  suggestedText: string;
  modelInfo?: string | null;
}

interface QueueNextPayload {
  projectUnitId: number;
  bibleId: number;
  bookCode: string;
  chapterNumber: number;
  currentVerse: number;
}

// How long to wait before retrying a fetch when the active verse has no suggestion.
const RETRY_DELAY_MS = 5000;

export type SuggestionStatus = 'idle' | 'generating' | 'unavailable' | 'error';

// Custom hook that orchestrates the "Stay Ahead" workflow on the frontend.
// It queues upcoming verses in the background when the drafter moves,
// and fetches suggestions on-demand when the active verse changes.
// and fetches suggestions on-demand when the active verse changes.
export function useAiSuggestions(
  projectUnitId: number,
  bibleId: number,
  bookCode: string,
  chapterNumber: number,
  verseMapping: Record<number, number>, // bibleTextId -> verseNumber
  activeVerseNumber: number,
  isAiEnabled = false
) {
  const isAiThresholdMet = useAppStore(state => state.isAiThresholdMet);
  const setIsAiThresholdMet = useAppStore(state => state.setIsAiThresholdMet);
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>('idle');
  const lastQueuedVerseRef = useRef<number>(-1);
  const hasCheckedThresholdRef = useRef(false);
  const currentChapterRef = useRef<number>(chapterNumber);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset refs when chapter changes
  if (currentChapterRef.current !== chapterNumber) {
    lastQueuedVerseRef.current = -1;
    hasCheckedThresholdRef.current = false;
    setSuggestionStatus('idle');
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    currentChapterRef.current = chapterNumber;
  }

  const bibleTextIds = Object.keys(verseMapping);
  const idsStr = bibleTextIds.join(',');

  const { data: fetchedSuggestions, refetch } = useQuery({
    queryKey: ['ai-suggestions', projectUnitId, idsStr],
    queryFn: async () => {
      const url = `${config.api.url}/ai-suggestions?projectUnitId=${projectUnitId}&bibleTextIds=${idsStr}`;
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch AI suggestions');
      }
      const data = (await res.json()) as { data: AiSuggestion[] };
      return data.data;
    },
    enabled: isAiEnabled && bibleTextIds.length > 0,
    // No refetchInterval — fetches are triggered on-demand by verse navigation.
  });

  const suggestions = useMemo(() => {
    const map: Record<number, string> = {};
    if (!isAiEnabled) return map; // Ensure no cached suggestions bleed through when turned off

    if (fetchedSuggestions) {
      fetchedSuggestions.forEach(item => {
        if (item.bibleTextId in verseMapping) {
          map[verseMapping[item.bibleTextId]] = item.suggestedText;
        }
      });
    }
    return map;
  }, [fetchedSuggestions, verseMapping, isAiEnabled]);

  // Refetch suggestions when the active verse changes. If the active verse has
  // no suggestion after the initial fetch, retry once after RETRY_DELAY_MS.
  // After the retry, if still no suggestion, mark as settled ("not available").
  useEffect(() => {
    if (!isAiEnabled) return;

    let isStale = false;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setSuggestionStatus('generating');

    void refetch().then(result => {
      if (isStale) return;

      if (result.isError) {
        setSuggestionStatus('error');
        return;
      }

      const data = result.data;
      const hasActiveSuggestion = data?.some(item => {
        const verseNum = verseMapping[item.bibleTextId];
        return verseNum === activeVerseNumber;
      });

      if (hasActiveSuggestion) {
        setSuggestionStatus('idle');
        return;
      }

      // No suggestion yet — schedule a single retry
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        void refetch().then(retryResult => {
          if (isStale) return;

          if (retryResult.isError) {
            setSuggestionStatus('error');
          } else {
            const hasSuggestionNow = retryResult.data?.some(
              item => verseMapping[item.bibleTextId] === activeVerseNumber
            );
            setSuggestionStatus(hasSuggestionNow ? 'idle' : 'unavailable');
          }
        });
      }, RETRY_DELAY_MS);
    });

    return () => {
      isStale = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVerseNumber, isAiEnabled]);

  // Mutation for queuing upcoming verses for AI translation
  const queueNextMutation = useMutation({
    mutationFn: async (payload: QueueNextPayload) => {
      const res = await fetch(`${config.api.url}/ai-suggestions/queue-next`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error('Failed to queue AI suggestions');
      }
      return (await res.json()) as { thresholdMet?: boolean; versesQueued?: number[] };
    },
    onSuccess: data => {
      setIsAiThresholdMet(!!data.thresholdMet);
    },
    onError: error => {
      Logger.logException(error, { context: 'Failed to queue AI suggestions' });
    },
  });

  // Assign directly during render so the ref is never stale inside the effect.
  const queueNextRef = useRef(queueNextMutation.mutate);
  queueNextRef.current = queueNextMutation.mutate;

  const prevIsAiEnabledRef = useRef(isAiEnabled);

  // Queue next verses when active verse changes
  useEffect(() => {
    // If AI is disabled, we only want to ping the backend ONCE per chapter to discover if the threshold is met
    if (!isAiEnabled && hasCheckedThresholdRef.current) {
      prevIsAiEnabledRef.current = isAiEnabled;
      return;
    }

    const justEnabled = isAiEnabled && !prevIsAiEnabledRef.current;

    if (activeVerseNumber > lastQueuedVerseRef.current || justEnabled) {
      if (!isAiEnabled) {
        hasCheckedThresholdRef.current = true;
      }
      lastQueuedVerseRef.current = activeVerseNumber;

      queueNextRef.current({
        projectUnitId,
        bibleId,
        bookCode,
        chapterNumber,
        currentVerse: activeVerseNumber,
      });
    }

    prevIsAiEnabledRef.current = isAiEnabled;
  }, [activeVerseNumber, projectUnitId, bibleId, bookCode, chapterNumber, isAiEnabled]);

  return { suggestions, isAiThresholdMet, suggestionStatus };
}

// Tracks whether the drafter used or dismissed an AI suggestion.
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
