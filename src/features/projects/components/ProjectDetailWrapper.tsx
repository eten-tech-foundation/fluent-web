import { getRouteApi, useLocation, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { useGetMilestones } from '@/features/projects/hooks/useMilestones';
import { useProjectDetails } from '@/features/projects/hooks/useProjectDetails';
import { useProjectBooks } from '@/features/projects/hooks/useProjectUnitBooks';
import { useChapterAssignments } from '@/hooks/useChapterAssignment';
import { useUsers } from '@/hooks/useUsers';
import { getActiveGrants, isProjectManager } from '@/lib/grant-utils';
import { ROLES } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { ProjectDetailPage } from './ProjectDetailPage';

const routeApi = getRouteApi('/_authenticated/projects/$projectId/');

export const ProjectDetailWrapper: React.FC = () => {
  const navigate = useNavigate();
  const { projectId } = routeApi.useParams();
  const { modal } = routeApi.useSearch();

  const {
    data: project,
    isLoading: projectLoading,
    error: projectError,
  } = useProjectDetails(projectId);

  const { userdetail } = useAppStore();
  const isManager = isProjectManager(
    getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId),
    project?.id
  );

  const { data: chapterAssignments } = useChapterAssignments(projectId);
  const { data: books } = useProjectBooks(projectId);
  const { data: users, isLoading: usersLoading } = useUsers(isManager);

  const { data: milestones, isLoading: milestonesLoading } = useGetMilestones(projectId);

  const location = useLocation();

  const handleBack = () => {
    const from = (location.state as { from?: string } | undefined)?.from;
    if (from) {
      void navigate({ to: from, replace: true });
      return;
    }

    if (userdetail?.role === ROLES.PROJECT_OBSERVER) {
      void navigate({ to: '/' });
    } else {
      void navigate({ to: '/projects' });
    }
  };

  const handleOpenAddUser = () => {
    void navigate({
      to: '/projects/$projectId',
      params: { projectId },
      search: { modal: 'add' as const },
      state: location.state,
    });
  };

  const handleCloseAddUser = () => {
    void navigate({
      to: '/projects/$projectId',
      params: { projectId },
      search: {},
      state: location.state,
    });
  };

  if (projectLoading) {
    return (
      <div className='flex h-full items-center justify-center gap-2'>
        <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
        <span className='text-gray-500'>Loading project details...</span>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className='flex h-full items-center justify-center'>
        <span className='text-red-500'>
          {projectError ? 'Failed to load project details' : 'Project not found'}
        </span>
      </div>
    );
  }

  return (
    <>
      <ProjectDetailPage
        books={books}
        chapterAssignments={chapterAssignments}
        isAddUserOpen={modal === 'add'}
        isManager={isManager}
        milestones={milestones}
        milestonesLoading={milestonesLoading}
        project={project}
        users={users}
        usersLoading={usersLoading}
        onAddUser={handleOpenAddUser}
        onBack={handleBack}
        onCloseAddUser={handleCloseAddUser}
      />
    </>
  );
};
