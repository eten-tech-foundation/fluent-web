import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import {
  UserRole,
  type CreateProject,
  type Project,
  type ProjectItem,
  type User,
} from '@/lib/types';

const fetchProjects = async (email: string): Promise<Project[]> => {
  const res = await fetch(`${config.api.url}/projects`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': email,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch projects');

  const data = (await res.json()) as Project[];
  return data;
};

const fetchUserProjects = async (user: User): Promise<Project[]> => {
  const res = await fetch(`${config.api.url}/users/${user.id}/projects`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': user.email,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch user projects');
  return (await res.json()) as Project[];
};

const createProject = async (
  projectData: Omit<CreateProject, 'id' | 'createdAt' | 'updatedAt'>,
  email: string
): Promise<Project> => {
  const res = await fetch(`${config.api.url}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': email,
    },
    body: JSON.stringify(projectData),
  });
  if (!res.ok) throw new Error('Failed to create project');
  const data = (await res.json()) as Project;
  return data;
};

export const useProjects = (email: string) => {
  return useQuery<Project[]>({
    queryKey: ['projects', email],
    queryFn: () => fetchProjects(email),
    enabled: !!email,
  });
};

export const useUserProjects = (user: User | null | undefined) => {
  return useQuery<Project[]>({
    queryKey: ['user-projects', user?.id],
    queryFn: () => {
      if (!user) throw new Error('User is required');
      return fetchUserProjects(user);
    },
    enabled: !!user?.id,
  });
};

export const useProjectsByRole = (user: User | null | undefined) => {
  const isManager = user?.role === UserRole.PROJECT_MANAGER;
  const managerQuery = useProjects(isManager ? (user as User).email : '');
  const translatorQuery = useUserProjects(!isManager ? user : null);
  return isManager ? managerQuery : translatorQuery;
};

export const useCreateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectData,
      email,
    }: {
      projectData: Omit<CreateProject, 'id' | 'createdAt' | 'updatedAt'>;
      email: string;
    }) => createProject(projectData, email),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: error => {
      Logger.logException(error, { context: 'Error creating project' });
    },
  });
};

const fetchChapterAssignments = async (user: User): Promise<ProjectItem[]> => {
  const response = await fetch(`${config.api.url}/users/${user.id}/chapter-assignments/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': user.email,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch chapter assignments');
  }
  return (await response.json()) as ProjectItem[];
};

export const useChapterAssignments = (user: User) => {
  return useQuery<ProjectItem[]>({
    queryKey: ['chapter-assignments', user],
    queryFn: () => fetchChapterAssignments(user),
    enabled: !!user,
  });
};
