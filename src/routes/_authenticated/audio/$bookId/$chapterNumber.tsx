import { createFileRoute, redirect } from '@tanstack/react-router';

import AudioReviewPage from '@/features/audio/components/AudioReviewPage';
import { getActiveGrants, isProjectManager } from '@/lib/grant-utils';
import { type ProjectItem } from '@/lib/types';
import { hydrationPromise, useAppStore } from '@/store/store';

export const Route = createFileRoute('/_authenticated/audio/$bookId/$chapterNumber')({
  loader: async ({ location }) => {
    await hydrationPromise;
    const { userdetail, currentProjectItem, setCurrentProjectItem } = useAppStore.getState();

    if (!userdetail) {
      throw redirect({ to: '/' });
    }

    // The audio route is reached by navigating with state.projectItem (same pattern as
    // translation/view routes). If the store already has the right item, use it; otherwise
    // fall back to the location state.
    const locationStateItem = (location.state as { projectItem?: ProjectItem } | undefined)
      ?.projectItem;

    let projectItem = currentProjectItem;

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

    // Restrict the audio review view to Project Managers only (spec #383).
    const activeGrants = getActiveGrants(userdetail.grants, userdetail.lastActiveOrgId);
    if (!isProjectManager(activeGrants, projectItem.projectId)) {
      throw redirect({ to: '/' });
    }

    setCurrentProjectItem(projectItem);
    return { projectItem };
  },
  component: AudioReviewPage,
  gcTime: 0,
  staleTime: 0,
});
