import React from 'react';

import { useMatch } from '@tanstack/react-router';
import { Loader } from 'lucide-react';

import { type translationLoader } from '@/features/bible/TranslationLoader';
import { getActiveGrants, isObserver } from '@/lib/grant-utils';
import { ROLES } from '@/lib/types';
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

  const activeGrants = getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId);
  const activeRoleGrants = activeGrants.filter(g => g.roleName === userdetail?.role);
  const isObserverRole =
    userdetail?.role === ROLES.PROJECT_OBSERVER || isObserver(activeRoleGrants);

  // Observer view is ALWAYS read-only, irrespective of chapter assignment status or route
  const isReadOnly = !!viewMatch || isObserverRole;

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
