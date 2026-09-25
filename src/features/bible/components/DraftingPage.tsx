import React, { useEffect, useMemo } from 'react';

import { useMatch, useNavigate } from '@tanstack/react-router';
import { Loader } from 'lucide-react';
import { toast } from 'sonner';

import { useSyncGlobalAiSetting } from '@/features/bible/hooks/useSyncGlobalAiSetting';
import { type translationLoader } from '@/features/bible/TranslationLoader';
import { useRefreshUserDetail } from '@/hooks/useRefreshUserDetail';
import { getActiveGrants, hasGrantForProject, ORG_LEVEL_ROLES } from '@/lib/grant-utils';
import { ROLES } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { DraftingUI } from './DraftingUI';

type LoaderData = Awaited<ReturnType<typeof translationLoader>>;

const DraftingPage: React.FC = () => {
  const userdetail = useAppStore(state => state.userdetail);
  const currentProjectItem = useAppStore(state => state.currentProjectItem);
  const setRoleChangeWarning = useAppStore(state => state.setRoleChangeWarning);
  const { refresh: refreshUserDetail } = useRefreshUserDetail();

  useEffect(() => {
    refreshUserDetail();
  }, [refreshUserDetail]);

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

  // Safer null-guard: returns undefined when loaderData is not yet available
  const projectItem = loaderData
    ? currentProjectItem?.chapterAssignmentId === loaderData.projectItem.chapterAssignmentId
      ? currentProjectItem
      : loaderData.projectItem
    : undefined;

  const activeGrants = getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId);
  const targetProjectId = projectItem?.projectId;

  const isObserverForProject = useMemo(() => {
    if (!targetProjectId) {
      return userdetail?.role === ROLES.PROJECT_OBSERVER;
    }

    // 1. Org-level managers are never restricted to observer read-only
    const isOrgManager = activeGrants.some(
      g =>
        (g.projectId === null || g.projectId === undefined) && ORG_LEVEL_ROLES.includes(g.roleName)
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

  const hasProjectGrant = useMemo(() => {
    if (!targetProjectId || !userdetail) return true;
    return hasGrantForProject(activeGrants, targetProjectId);
  }, [activeGrants, targetProjectId, userdetail]);

  // Observer view or explicit /view route is ALWAYS read-only
  const isReadOnly = !!viewMatch || isObserverForProject;

  const navigate = useNavigate();

  useEffect(() => {
    if (targetProjectId && !hasProjectGrant) {
      toast.error('You have been removed from this project.');
      setRoleChangeWarning(false);
      void navigate({ to: '/', replace: true });
      return;
    }

    if (!!translationMatch && isObserverForProject) {
      setRoleChangeWarning(true);
    }
  }, [
    translationMatch,
    isObserverForProject,
    hasProjectGrant,
    targetProjectId,
    navigate,
    setRoleChangeWarning,
  ]);

  // Sync the user's global AI auto-enable preference to this chapter.
  // Must be called after isReadOnly is derived — the hook skips syncing for read-only views.
  useSyncGlobalAiSetting(
    projectItem?.chapterAssignmentId,
    projectItem?.projectId,
    projectItem?.isAiEnabled,
    isReadOnly,
    projectItem
  );

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
