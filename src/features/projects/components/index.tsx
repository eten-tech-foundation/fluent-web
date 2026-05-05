import React from 'react';

import { getRouteApi, useNavigate } from '@tanstack/react-router';

import { ProjectsPage } from '@/features/projects/components/ProjectPage';
import { useCreateProject, useProjectsByRole } from '@/features/projects/hooks/useProjects';
import { Logger } from '@/lib/services/logger';
import { UserRole, type CreateProject } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { CreateProjectModal, type CreateProjectData } from './CreateProjectModal';

const routeApi = getRouteApi('/_authenticated/projects/');

export const ProjectsWrapper: React.FC = () => {
  const navigate = useNavigate();
  const { modal } = routeApi.useSearch();
  const { userdetail } = useAppStore();

  const { data: projects = [], isLoading } = useProjectsByRole(userdetail);
  const createProjectMutation = useCreateProject();

  const isManager = userdetail?.role === UserRole.PROJECT_MANAGER;

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
    });
  };

  const handleSave = async (projectData: CreateProjectData) => {
    try {
      const newProjectData: Omit<CreateProject, 'id' | 'createdAt' | 'updatedAt'> = {
        name: projectData.title,
        targetLanguage: projectData.targetLanguage,
        sourceLanguage: projectData.sourceLanguage,
        bibleId: projectData.sourceBible,
        bookId: projectData.books,
        organization: Number(userdetail?.organization),
        createdBy: Number(userdetail?.id),
        metadata: {},
      };

      await createProjectMutation.mutateAsync({
        projectData: newProjectData,
        email: userdetail?.email ?? '',
      });

      handleCloseCreate();
    } catch (error) {
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'Failed to create project.',
      });
    }
  };

  return (
    <>
      <ProjectsPage
        isManager={isManager}
        loading={isLoading}
        projects={projects}
        onCreateProject={handleOpenCreate}
        onProjectSelect={handleProjectSelect}
      />

      {isManager && (
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
