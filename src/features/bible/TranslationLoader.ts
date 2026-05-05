import { fetchTargetText } from '@/features/bible/hooks/useBibleTarget';
import { fetchBibleText } from '@/features/bible/hooks/useBibleText';
import { type ProjectItem, type Source, type TargetVerse } from '@/lib/types';
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
});

export const translationLoader = async ({
  location,
}: {
  location: { search?: Record<string, string>; state?: { projectItem?: ProjectItem } };
}) => {
  await hydrationPromise;
  const { userdetail, currentProjectItem, setCurrentProjectItem } = useAppStore.getState();

  if (!userdetail) {
    throw new Error('User details are missing.');
  }
  let projectItem =
    (location.state as { projectItem?: ProjectItem }).projectItem ??
    currentProjectItem ??
    undefined;
  if (!projectItem) {
    throw new Error('Project item is missing. Please navigate from the project list.');
  }
  setCurrentProjectItem(projectItem);

  const search = location.search as { t?: string };
  const cacheParam = search.t ?? Date.now().toString();

  const [sourceVerseData, targetVerseData] = await Promise.all([
    fetchBibleText(projectItem.bibleId, projectItem.bookId, projectItem.chapterNumber),
    fetchTargetText(
      projectItem.projectUnitId,
      projectItem.bookId,
      projectItem.chapterNumber,
      userdetail.email
    ),
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
