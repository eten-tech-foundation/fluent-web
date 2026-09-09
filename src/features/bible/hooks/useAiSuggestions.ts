import { useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery } from '@tanstack/react-query';

import type { PericopeSuggestionScope } from '@/features/bible/lib/ai-suggestion-scope';
import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { useAppStore } from '@/store/store';

interface AiSuggestion {
  bibleTextId: number;
  suggestedText: string;
  modelInfo?: string | null;
}

interface SuggestionOptions {
  pericope?: PericopeSuggestionScope;
  /** Read-only and non-drafting surfaces must not queue work or probe the threshold. */
  canSuggest?: boolean;
  draftedVerseNumbers?: number[];
}

const RETRY_DELAY_MS = 5000;
// A whole pericope can take several worker passes. Bound retries so an unavailable
// AI service does not leave the editor polling forever.
const PERICOPE_RETRIES = 12;

export type SuggestionStatus = 'idle' | 'generating' | 'unavailable' | 'error';

export function useAiSuggestions(
  projectUnitId: number,
  bibleId: number,
  bookCode: string,
  chapterNumber: number,
  verseMapping: Record<number, number>,
  activeVerseNumber: number,
  isAiEnabled = false,
  { pericope, canSuggest = true, draftedVerseNumbers = [] }: SuggestionOptions = {}
) {
  const isAiThresholdMet = useAppStore(state => state.isAiThresholdMet);
  const setIsAiThresholdMet = useAppStore(state => state.setIsAiThresholdMet);
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>('idle');
  const checkedThresholdsRef = useRef(new Set<string>());
  const enabled = isAiEnabled && canSuggest;
  const contextKey = `${projectUnitId}/${bibleId}/${bookCode}/${chapterNumber}`;
  const idsStr = Object.keys(verseMapping).join(',');
  // Strings keep effect identities stable when callers rebuild arrays during typing.
  const activeNumbersKey = (pericope?.verseNumbers ?? [activeVerseNumber]).join(',');
  const nextNumbersKey = (pericope?.nextVerseNumbers ?? []).join(',');
  const requestedNumbers = new Set([
    ...(pericope?.verseNumbers ?? [activeVerseNumber]),
    ...(pericope?.nextVerseNumbers ?? []),
  ]);
  const draftedNumbers = new Set(draftedVerseNumbers);
  const requiredIdsKey = Object.entries(verseMapping)
    .filter(([, number]) => requestedNumbers.has(number) && !draftedNumbers.has(number))
    .map(([id]) => id)
    .join(',');
  const retries = pericope ? PERICOPE_RETRIES : 1;

  const { data: fetchedSuggestions, refetch } = useQuery({
    queryKey: ['ai-suggestions', contextKey, idsStr],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `${config.api.url}/ai-suggestions?projectUnitId=${projectUnitId}&bibleTextIds=${idsStr}&t=${Date.now()}`,
        {
          credentials: 'include',
          signal,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        }
      );
      if (!res.ok) throw new Error('Failed to fetch AI suggestions');
      const data = (await res.json()) as { data: AiSuggestion[] };
      return data.data;
    },
    enabled: enabled && idsStr.length > 0,
    retry: false,
  });

  const suggestions = useMemo(() => {
    const map: Record<number, string> = {};
    if (!enabled) return map;
    for (const item of fetchedSuggestions ?? []) {
      if (item.bibleTextId in verseMapping && item.suggestedText.trim()) {
        map[verseMapping[item.bibleTextId]] = item.suggestedText;
      }
    }
    return map;
  }, [fetchedSuggestions, verseMapping, enabled]);

  // Check the entire group, including the prefetched group. Moving the caret
  // within one pericope does not restart requests or abandon later verses.
  useEffect(() => {
    if (!enabled || !idsStr) return;
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const requiredIds = requiredIdsKey ? requiredIdsKey.split(',').map(Number) : [];
    const activeNumbers = new Set(activeNumbersKey.split(',').map(Number));
    const activeIds = requiredIds.filter(id => activeNumbers.has(verseMapping[id]));
    let attempts = 0;

    const fetchPending = async () => {
      const result = await refetch({ cancelRefetch: false });
      if (stale) return;
      if (result.isError) {
        setSuggestionStatus('error');
        return;
      }
      const ready = new Set(
        result.data?.filter(item => item.suggestedText.trim()).map(item => item.bibleTextId)
      );
      const activeReady = activeIds.every(id => ready.has(id));
      setSuggestionStatus(activeReady ? 'idle' : attempts < retries ? 'generating' : 'unavailable');
      if (attempts < retries && requiredIds.some(id => !ready.has(id))) {
        attempts += 1;
        timer = setTimeout(() => void fetchPending(), RETRY_DELAY_MS);
      }
    };

    setSuggestionStatus(activeIds.length ? 'generating' : 'idle');
    void fetchPending();
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [
    enabled,
    contextKey,
    idsStr,
    activeNumbersKey,
    nextNumbersKey,
    requiredIdsKey,
    retries,
    refetch,
    verseMapping,
  ]);

  // queue-next accepts a cursor, not a range. Visit the predecessors of every
  // requested verse so groups longer than the server's lookahead are covered.
  // The API deduplicates overlapping verse jobs with a per-verse singleton key.
  const queueCursorsKey = pericope
    ? [
        ...new Set(
          [...pericope.verseNumbers, ...pericope.nextVerseNumbers].map(number =>
            Math.max(1, number - 1)
          )
        ),
      ].join(',')
    : String(activeVerseNumber);

  useEffect(() => {
    if (!canSuggest || !idsStr || !queueCursorsKey) return;
    if (!enabled && checkedThresholdsRef.current.has(contextKey)) return;
    checkedThresholdsRef.current.add(contextKey);
    const controller = new AbortController();

    const queue = async () => {
      const cursors = enabled
        ? queueCursorsKey.split(',').map(Number)
        : [Number(queueCursorsKey.split(',')[0])];
      for (const currentVerse of cursors) {
        const res = await fetch(`${config.api.url}/ai-suggestions/queue-next`, {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectUnitId, bibleId, bookCode, chapterNumber, currentVerse }),
        });
        if (!res.ok) throw new Error('Failed to queue AI suggestions');
        const data = (await res.json()) as { thresholdMet: boolean };
        if (controller.signal.aborted) return;
        setIsAiThresholdMet(data.thresholdMet);
        if (!data.thresholdMet) break;
      }
      if (enabled && !controller.signal.aborted) await refetch({ cancelRefetch: false });
    };

    void queue().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      Logger.logException(error, { context: 'Failed to queue AI suggestions' });
      if (enabled) setSuggestionStatus('error');
    });
    return () => controller.abort();
  }, [
    projectUnitId,
    bibleId,
    bookCode,
    chapterNumber,
    contextKey,
    idsStr,
    queueCursorsKey,
    canSuggest,
    enabled,
    refetch,
    setIsAiThresholdMet,
  ]);

  return {
    suggestions,
    isAiThresholdMet,
    suggestionStatus: enabled ? suggestionStatus : ('idle' as SuggestionStatus),
  };
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
