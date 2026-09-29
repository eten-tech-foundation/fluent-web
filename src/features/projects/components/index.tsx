import React from 'react';

import { Navigate, getRouteApi, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';

import { ProjectsPage } from '@/features/projects/components/ProjectPage';
import { useCreateProject, useProjectsByRole } from '@/features/projects/hooks/useProjects';
import { buildProjectMetadata } from '@/features/projects/lib/projectMetadata';
import { useRefreshUserDetail } from '@/hooks/useRefreshUserDetail';
import { canCreateProject, getActiveGrants, isManager } from '@/lib/grant-utils';
import { Logger } from '@/lib/services/logger';
import { type CreateProject } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { CreateProjectModal, type CreateProjectData } from './CreateProjectModal';

const routeApi = getRouteApi('/_authenticated/projects/');

// Where translator/reviewer/observer roles land instead of the Projects list (#410).
// Update this to match whatever route these roles actually use in your app.
const NON_MANAGER_LANDING_ROUTE = '/';

export const ProjectsWrapper: React.FC = () => {
  const navigate = useNavigate();
  const { modal } = routeApi.useSearch();
  const { userdetail } = useAppStore();
  const { refresh: refreshUserDetail } = useRefreshUserDetail();

  const { data: projects = [], isLoading } = useProjectsByRole(userdetail);
  const createProjectMutation = useCreateProject();

  const activeOrgId = userdetail?.lastActiveOrgId;
  const activeGrants = getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId);
  const activeRoleGrants = activeGrants.filter(g => g.roleName === userdetail?.role);

  // Ticket #410: only project managers and org managers can view this page at all.
  const canViewProjectsList = isManager(activeRoleGrants);

  // Per #410: org managers only, target state. Project Managers keep access
  // temporarily until the Org Manager dashboard ships — see
  // ALLOW_PROJECT_MANAGER_TO_CREATE_PROJECT in grant-utils.ts.
  const canCreate = canCreateProject(activeRoleGrants);

  const handleOpenCreate = () => {
    void navigate({
      to: '/projects',
      search: { modal: 'create' as const },
    });
  };

  const handleCloseCreate = () => {
    void navigate({
      to: '/projects',
      search: {},
    });
  };

  const handleProjectSelect = (projectId: number) => {
    void navigate({
      to: '/projects/$projectId',
      params: { projectId: projectId.toString() },
      state: { from: '/projects' },
    });
  };

  const handleSave = async (projectData: CreateProjectData) => {
    if (!activeOrgId) {
      toast.error('No active organization selected');
      return;
    }
    try {
      const newProjectData: Omit<CreateProject, 'id' | 'createdAt' | 'updatedAt'> = {
        name: projectData.title,
        targetLanguage: projectData.targetLanguage,
        sourceLanguage: projectData.sourceLanguage,
        sourceBibleId: projectData.sourceBible,
        bookId: [],
        organization: activeOrgId,
        createdBy: Number(userdetail.id),
        metadata: buildProjectMetadata(projectData.connectivityProfile),
        pericopeSetId: projectData.pericopeSetId,
        ...(projectData.usfmFiles && { usfmFiles: projectData.usfmFiles }),
      };

      await createProjectMutation.mutateAsync({
        projectData: newProjectData,
      });

      // Refresh userdetail so the new PM grant (assigned by the backend on project
      // creation) is in the store immediately — avoids a stale-grants view on first open.
      refreshUserDetail();

      handleCloseCreate();
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to create project.',
      });
    }
  };

  // Route non-manager roles away from the Projects list entirely (#410).
  // The `userdetail &&` guard matters: without it, every user briefly gets
  // redirected on page refresh, before userdetail finishes loading — including
  // real managers. Waiting for userdetail avoids that flicker/bug.
  if (userdetail && !canViewProjectsList) {
    return <Navigate replace to={NON_MANAGER_LANDING_ROUTE} />;
  }

  return (
    <>
      <ProjectsPage
        isManager={canCreate}
        loading={isLoading}
        projects={projects}
        onCreateProject={handleOpenCreate}
        onProjectSelect={handleProjectSelect}
      />

      {canCreate && (
        <CreateProjectModal
          error={createProjectMutation.error?.message}
          isLoading={createProjectMutation.isPending}
          isOpen={modal === 'create'}
          onClose={handleCloseCreate}
          onSave={handleSave}
        />
      )}
    </>
  );
};
