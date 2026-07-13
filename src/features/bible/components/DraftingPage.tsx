import React from 'react';

import { useMatch } from '@tanstack/react-router';
import { Loader } from 'lucide-react';

import { type translationLoader } from '@/features/bible/TranslationLoader';
import { useAppStore } from '@/store/store';

import { DraftingUI } from './DraftingUI';

type LoaderData = Awaited<ReturnType<typeof translationLoader>>;

const DraftingPage: React.FC = () => {
  const { userdetail, currentProjectItem } = useAppStore();

  const translationMatch = useMatch({
    from: '/_authenticated/translation/$bookId/$chapterNumber',
    shouldThrow: false,
  });

  const viewMatch = useMatch({
    from: '/_authenticated/view/$bookId/$chapterNumber',
    shouldThrow: false,
  });

  const rawLoaderData = translationMatch
    ? translationMatch.loaderData
    : viewMatch
      ? viewMatch.loaderData
      : undefined;

  const loaderData = rawLoaderData as LoaderData | undefined;
  const isReadOnly = !!viewMatch;

  if (!loaderData || !userdetail) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader className='h-8 w-8 animate-spin' />
      </div>
    );
  }

  const projectItem =
    currentProjectItem?.chapterAssignmentId === loaderData.projectItem.chapterAssignmentId
      ? currentProjectItem
      : loaderData.projectItem;

  return (
    <DraftingUI
      projectItem={projectItem}
      readOnly={isReadOnly}
      sourceVerses={loaderData.sourceVerses}
      targetVerses={loaderData.targetVerses}
      userdetail={userdetail}
    />
  );
};

export default DraftingPage;
