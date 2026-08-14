import React, { useMemo } from 'react';

import { useMatch } from '@tanstack/react-router';
import { Loader } from 'lucide-react';

import { type translationLoader } from '@/features/bible/TranslationLoader';
import { getActiveGrants } from '@/lib/grant-utils';
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

  const projectItem =
    currentProjectItem?.chapterAssignmentId === loaderData?.projectItem.chapterAssignmentId
      ? currentProjectItem
      : loaderData?.projectItem;

  const activeGrants = getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId);
  const targetProjectId = projectItem?.projectId;

  const isObserverForProject = useMemo(() => {
    if (!targetProjectId) {
      return userdetail?.role === ROLES.PROJECT_OBSERVER;
    }

    // 1. Org-level managers are never restricted to observer read-only
    const isOrgManager = activeGrants.some(
      g =>
        (g.projectId === null || g.projectId === undefined) &&
        ['Org Manager', 'Org Owner', 'SuperAdmin'].includes(g.roleName)
    );
    if (isOrgManager) return false;

    // 2. Resolve grant specifically matching targetProjectId
    const projectGrant = activeGrants.find(
      g => g.projectId === targetProjectId || g.projectId === Number(targetProjectId)
    );
    if (projectGrant) {
      return projectGrant.roleName === ROLES.PROJECT_OBSERVER;
    }

    // 3. Fallback to active role
    return userdetail?.role === ROLES.PROJECT_OBSERVER;
  }, [activeGrants, targetProjectId, userdetail?.role]);

  // Observer view or explicit /view route is ALWAYS read-only
  const isReadOnly = !!viewMatch || isObserverForProject;

  if (!loaderData || !userdetail || !projectItem) {
    return (
      <div className='flex h-screen items-center justify-center'>
        <Loader className='h-8 w-8 animate-spin' />
      </div>
    );
  }

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
