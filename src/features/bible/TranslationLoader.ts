import { redirect } from '@tanstack/react-router';

import { fetchTargetText } from '@/features/bible/hooks/useBibleTarget';
import { fetchBibleText } from '@/features/bible/hooks/useBibleText';
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
}: {
  location: { search?: Record<string, string>; state?: { projectItem?: ProjectItem } };
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
  let projectItem = currentProjectItem;

  // Only use the location state if it's a different assignment than what we have in the store
  if (
    locationStateItem &&
    locationStateItem.chapterAssignmentId !== currentProjectItem?.chapterAssignmentId
  ) {
    projectItem = locationStateItem;
  } else if (!projectItem && locationStateItem) {
    projectItem = locationStateItem;
  }

  if (!projectItem) {
    throw redirect({ to: '/' });
  }
  setCurrentProjectItem(projectItem);

  const search = location.search as { t?: string };
  const cacheParam = search.t ?? Date.now().toString();

  const [sourceVerseData, targetVerseData] = await Promise.all([
    fetchBibleText(projectItem.bibleId, projectItem.bookId, projectItem.chapterNumber),
    fetchTargetText(projectItem.projectUnitId, projectItem.bookId, projectItem.chapterNumber),
  ]);

  const sourceVerses: Source[] = (sourceVerseData as unknown as SourceVerseData[]).map(
    toSourceVerse
  );
  const targetVerses: TargetVerse[] = (targetVerseData as unknown as TargetVerseData[]).map(
    toTargetVerse
  );

  return {
    projectItem,
    sourceVerses,
    targetVerses,
    loadedAt: cacheParam,
  };
};
