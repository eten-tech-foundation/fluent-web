import { useEffect, useState, useCallback, useRef } from 'react';

import { config } from '@/lib/config';

interface AiSuggestion {
  bibleTextId: number;
  suggestedText: string;
  modelInfo?: string | null;
}

export function useAiSuggestions(
  projectUnitId: number,
  bibleId: number,
  bookCode: string,
  chapterNumber: number,
  verseMapping: Record<number, number>, // bibleTextId -> verseNumber
  activeVerseNumber: number,
  email: string
) {
  const [suggestions, setSuggestions] = useState<Record<number, string>>({});
  const lastQueuedVerseRef = useRef<number>(-1);

  const fetchSuggestions = useCallback(async () => {
    const bibleTextIds = Object.keys(verseMapping);
    if (bibleTextIds.length === 0) return;

    try {
      const idsStr = bibleTextIds.join(',');
      const res = await fetch(
        `${config.api.url}/ai-suggestions?projectUnitId=${projectUnitId}&bibleTextIds=${idsStr}`,
        {
          headers: {
            'x-user-email': email,
          },
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { data: AiSuggestion[] };
        const newSuggestions: Record<number, string> = {};

        data.data.forEach((item: AiSuggestion) => {
          if (item.bibleTextId in verseMapping) {
            const vNum = verseMapping[item.bibleTextId];
            newSuggestions[vNum!] = item.suggestedText;
          }
        });

        setSuggestions(prev => {
          // Only update if changed
          const isChanged = Object.entries(newSuggestions).some(([k, v]) => prev[Number(k)] !== v);
          if (isChanged) return { ...prev, ...newSuggestions };
          return prev;
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch AI suggestions', e);
    }
  }, [projectUnitId, verseMapping, email]);

  // Initial fetch and polling
  useEffect(() => {
    void fetchSuggestions();
    const interval = setInterval(() => {
      void fetchSuggestions();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);

  // Queue next verses when active verse changes
  useEffect(() => {
    if (activeVerseNumber > lastQueuedVerseRef.current) {
      lastQueuedVerseRef.current = activeVerseNumber;

      fetch(`${config.api.url}/ai-suggestions/queue-next`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': email,
        },
        body: JSON.stringify({
          projectUnitId,
          bibleId,
          bookCode: bookCode.toLowerCase(),
          chapterNumber,
          currentVerse: activeVerseNumber,
          lookahead: 5,
        }),
      }).catch(e => {
        // eslint-disable-next-line no-console
        console.error('Failed to queue AI suggestions', e);
      });
    }
  }, [activeVerseNumber, projectUnitId, bibleId, bookCode, chapterNumber, email]);

  return { suggestions };
}
