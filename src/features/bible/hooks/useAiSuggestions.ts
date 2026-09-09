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

export interface AiHeadingSuggestion {
  pericopeNumber: string;
  bibleTextId: number;
  suggestedText: string;
}

interface SuggestionOptions {
  pericope?: PericopeSuggestionScope;
  /** Read-only and non-drafting surfaces must not queue work or probe the threshold. */
  canSuggest?: boolean;
  draftedVerseNumbers?: number[];
  titledVerseNumbers?: number[];
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
  {
    pericope,
    canSuggest = true,
    draftedVerseNumbers = [],
    titledVerseNumbers = [],
  }: SuggestionOptions = {}
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

  const pericopeNumbersKey = pericope?.pericopeNumbers.join(',') ?? '';
  const titledNumbers = new Set(titledVerseNumbers);
  const requiredTitlesKey = Object.entries(pericope?.titleVerseNumbers ?? {})
    .filter(([, verse]) => !titledNumbers.has(verse))
    .map(([number]) => number)
    .join(',');
  const fetchHeadings =
    enabled && !!pericopeNumbersKey && Object.keys(pericope?.titleVerseNumbers ?? {}).length > 0;
  const { data: fetchedHeadings, refetch: refetchHeadings } = useQuery({
    queryKey: ['ai-pericope-headings', contextKey, pericopeNumbersKey],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        projectUnitId: String(projectUnitId),
        bibleId: String(bibleId),
        bookCode,
        chapterNumber: String(chapterNumber),
        pericopeNumbers: pericopeNumbersKey,
      });
      const res = await fetch(`${config.api.url}/ai-suggestions/pericopes?${params}`, {
        credentials: 'include',
        signal,
      });
      if (!res.ok) throw new Error('Failed to fetch AI heading suggestions');
      return ((await res.json()) as { data: AiHeadingSuggestion[] }).data;
    },
    enabled: fetchHeadings,
    retry: false,
  });
  const headingSuggestions = useMemo(
    () =>
      enabled
        ? Object.fromEntries(
            (fetchedHeadings ?? [])
              .filter(heading => heading.suggestedText.trim())
              .map(heading => [heading.pericopeNumber, heading])
          )
        : {},
    [enabled, fetchedHeadings]
  );

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
      const [result, headingResult] = await Promise.all([
        refetch({ cancelRefetch: false }),
        fetchHeadings ? refetchHeadings({ cancelRefetch: false }) : undefined,
      ]);
      if (stale) return;
      if (result.isError || headingResult?.isError) {
        setSuggestionStatus('error');
        return;
      }
      const ready = new Set(
        result.data?.filter(item => item.suggestedText.trim()).map(item => item.bibleTextId)
      );
      const readyTitles = new Set(
        headingResult?.data
          ?.filter(heading => heading.suggestedText.trim())
          .map(heading => heading.pericopeNumber)
      );
      const requiredTitles = requiredTitlesKey ? requiredTitlesKey.split(',') : [];
      const activeTitle = pericopeNumbersKey.split(',')[0];
      const activeReady =
        activeIds.every(id => ready.has(id)) &&
        (!requiredTitles.includes(activeTitle) || readyTitles.has(activeTitle));
      setSuggestionStatus(activeReady ? 'idle' : attempts < retries ? 'generating' : 'unavailable');
      if (
        attempts < retries &&
        (requiredIds.some(id => !ready.has(id)) ||
          requiredTitles.some(number => !readyTitles.has(number)))
      ) {
        attempts += 1;
        timer = setTimeout(() => void fetchPending(), RETRY_DELAY_MS);
      }
    };

    setSuggestionStatus(activeIds.length || requiredTitlesKey ? 'generating' : 'idle');
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
    fetchHeadings,
    refetchHeadings,
    requiredTitlesKey,
    pericopeNumbersKey,
  ]);

  // A single server request resolves and queues the exact active/next groups.
  // Verse mode retains its cursor-based lookahead.
  const isPericope = !!pericope;
  const queueVerseNumber = isPericope
    ? Number(activeNumbersKey.split(',')[0]) || 1
    : activeVerseNumber;
  useEffect(() => {
    if (!canSuggest || !idsStr || (isPericope && !pericopeNumbersKey)) return;
    if (!enabled && checkedThresholdsRef.current.has(contextKey)) return;
    const controller = new AbortController();
    const queue = async () => {
      const pericopeRequest = isPericope && enabled;
      const payload = {
        projectUnitId,
        bibleId,
        bookCode,
        chapterNumber,
        ...(pericopeRequest
          ? { pericopeNumbers: pericopeNumbersKey.split(',') }
          : { currentVerse: queueVerseNumber }),
      };
      const res = await fetch(
        `${config.api.url}/ai-suggestions/${pericopeRequest ? 'queue-pericopes' : 'queue-next'}`,
        {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error('Failed to queue AI suggestions');
      const data = (await res.json()) as { thresholdMet: boolean };
      if (controller.signal.aborted) return;
      checkedThresholdsRef.current.add(contextKey);
      setIsAiThresholdMet(data.thresholdMet);
      if (enabled)
        await Promise.all([
          refetch({ cancelRefetch: false }),
          fetchHeadings ? refetchHeadings({ cancelRefetch: false }) : undefined,
        ]);
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
    isPericope,
    pericopeNumbersKey,
    queueVerseNumber,
    canSuggest,
    enabled,
    refetch,
    fetchHeadings,
    refetchHeadings,
    setIsAiThresholdMet,
  ]);

  return {
    suggestions,
    headingSuggestions,
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
      pericopeNumber,
    }: {
      bibleTextId: number;
      projectUnitId: number;
      wasUsed: boolean;
      pericopeNumber?: string;
    }) => {
      const res = await fetch(
        `${config.api.url}/ai-suggestions/${pericopeNumber === undefined ? '' : 'pericopes/'}usage`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            bibleTextId,
            projectUnitId,
            wasUsed,
            ...(pericopeNumber === undefined ? {} : { pericopeNumber }),
          }),
        }
      );
      if (!res.ok) {
        throw new Error('Failed to track AI usage');
      }
    },
    onError: error => {
      Logger.logException(error, { context: 'Error tracking AI suggestion usage' });
    },
  });
};
