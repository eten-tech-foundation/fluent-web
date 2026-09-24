import { type QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

import { targetTextQueryOptions } from '@/features/bible/hooks/useBibleTarget';
import { bibleTextQueryOptions } from '@/features/bible/hooks/useBibleText';
import { type ProjectItem, type Source, type TargetVerse, type VerseMarkers } from '@/lib/types';
import { hydrationPromise, useAppStore } from '@/store/store';

interface SourceVerseData {
  id: number;
  verseNumber: number;
  text: string;
}

interface TargetVerseData {
  id: number;
  verseNumber: number;
  content: string;
  markers?: VerseMarkers | null;
}

const toSourceVerse = (verse: SourceVerseData): Source => ({
  id: verse.id,
  verseNumber: verse.verseNumber,
  text: verse.text,
});

const toTargetVerse = (verse: TargetVerseData): TargetVerse => ({
  id: verse.id,
  verseNumber: verse.verseNumber,
  content: verse.content,
  // Absent on responses from an API without fluent-api#264 yet; null and absent both mean
  // "no stored paragraph structure" and the editor treats them identically.
  markers: verse.markers ?? null,
});

export const translationLoader = async ({
  location,
  context,
}: {
  location: { search?: Record<string, string>; state?: { projectItem?: ProjectItem } };
  context: { queryClient: QueryClient };
}) => {
  await hydrationPromise;
  const { userdetail, currentProjectItem, setCurrentProjectItem } = useAppStore.getState();

  // A fresh session (deep link, new tab, shared URL) has no store state to translate the URL
  // into an assignment. That is a navigation problem, not an application error: send the user to
  // the dashboard, where opening the assignment populates everything this loader needs
  // (fluent-web#427).
  if (!userdetail) {
    throw redirect({ to: '/' });
  }
  const locationStateItem = location.state?.projectItem;
  // Explicit navigation carries the assignment just selected by the user. Persisted IDs can
  // be reused after a database reset, so the stored item's matching ID does not make it current.
  const projectItem = locationStateItem ?? currentProjectItem;

  if (!projectItem) {
    throw redirect({ to: '/' });
  }
  setCurrentProjectItem(projectItem);

  // Both routes declare `validateSearch`, so the router always supplies `search` — but the type
  // says it's optional, so read it as one instead of asserting it away.
  const cacheParam = location.search?.t ?? Date.now().toString();
  // An explicit navigation cache buster also refreshes the shared chapter rows. A generated
  // loadedAt value only identifies the editor load; ordinary navigation can reuse fresh data.
  const refreshOptions = location.search?.t !== undefined ? { staleTime: 0 } : {};

  const [sourceVerseData, targetVerseData] = await Promise.all([
    context.queryClient.fetchQuery({
      ...bibleTextQueryOptions(projectItem.bibleId, projectItem.bookId, projectItem.chapterNumber),
      ...refreshOptions,
    }),
    context.queryClient.fetchQuery({
      ...targetTextQueryOptions(
        projectItem.projectUnitId,
        projectItem.bookId,
        projectItem.chapterNumber
      ),
      ...refreshOptions,
    }),
  ]);

  // Cache raw rows, then project only this assignment's chapter into editable data. fetchQuery
  // waits for invalidated translations instead of handing an old draft back to the editor.
  const sourceVerses: Source[] = sourceVerseData.map(toSourceVerse);
  const targetVerses: TargetVerse[] = targetVerseData.map(toTargetVerse);

  return {
    projectItem,
    sourceVerses,
    targetVerses,
    loadedAt: cacheParam,
  };
};
