import { useEffect, useMemo } from 'react';

import { getRouteApi, useLocation, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useOrganization } from '@/features/organizations/hooks/useOrganizations';
import { useGetMilestones } from '@/features/projects/hooks/useMilestones';
import { useProjectDetails } from '@/features/projects/hooks/useProjectDetails';
import { useProjectBooks } from '@/features/projects/hooks/useProjectUnitBooks';
import { useChapterAssignments } from '@/hooks/useChapterAssignment';
import { useUsers } from '@/hooks/useUsers';
import {
  canManageProject,
  getActiveGrants,
  getActiveRoleGrants,
  hasGrantForProject,
  isManager,
  isProjectManagerOnly,
  isSuperAdmin,
} from '@/lib/grant-utils';
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

  const location = useLocation();
  const userdetail = useAppStore(state => state.userdetail);
  const setRoleChangeWarning = useAppStore(state => state.setRoleChangeWarning);
  const activeGrants = getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId);
  const targetProjectId = Number(projectId);

  const hasProjectGrant = useMemo(() => {
    if (!targetProjectId || !userdetail) return true;
    return hasGrantForProject(activeGrants, targetProjectId);
  }, [activeGrants, targetProjectId, userdetail]);

  useEffect(() => {
    if (targetProjectId && !hasProjectGrant) {
      toast.error('You have been removed from this project.');
      setRoleChangeWarning(false);
      void navigate({ to: '/', replace: true });
    }
  }, [hasProjectGrant, targetProjectId, navigate, setRoleChangeWarning]);

  // Same check the page uses to show the button, repeated here so `?modal=metadata`
  // typed straight into the URL cannot open the editor for a non-manager.
  const activeRoleGrants = getActiveRoleGrants(userdetail);
  const isManagerUser = isManager(activeRoleGrants);
  // A Super Admin gets the controls an Org Manager of the project's organization has (#566).
  // Manage Workflow stays with Project Managers, as for an Org Manager.
  const isProjectMgr = canManageProject(userdetail, project?.id);
  const isPMOnly = isManagerUser && isProjectManagerOnly(activeRoleGrants, project?.id);
  const superAdmin = isSuperAdmin(userdetail?.grants);

  const { data: chapterAssignments } = useChapterAssignments(projectId);
  const { data: books } = useProjectBooks(projectId);
  const { data: users, isLoading: usersLoading } = useUsers(isProjectMgr);
  // A Super Admin holds no grant naming the project's organization, so its name for the
  // invitation email comes from the organization itself.
  const { data: projectOrganization } = useOrganization(
    superAdmin ? project?.organization : undefined
  );

  const { data: milestones, isLoading: milestonesLoading } = useGetMilestones(projectId);

  const handleBack = () => {
    const from = (location.state as { from?: string } | undefined)?.from;
    if (from) {
      void navigate({ to: from, replace: true });
      return;
    }

    if (superAdmin && project) {
      // Super Admins open projects from an organization's Projects tab, so Back returns there,
      // also after a milestone page, which comes back here without the original state.
      void navigate({
        to: '/organizations/$orgId',
        params: { orgId: project.organization.toString() },
        search: { tab: 'projects' },
        replace: true,
      });
      return;
    }

    void navigate({ to: '/projects' });
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
        isManager={isProjectMgr}
        isProjectManagerOnly={isPMOnly}
        milestones={milestones}
        milestonesLoading={milestonesLoading}
        organizationName={projectOrganization?.name}
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
