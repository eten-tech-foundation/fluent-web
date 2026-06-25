import { useQuery } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { type ChapterStatusCounts, type WorkflowStep } from '@/lib/types';

export interface ProjectMetadata {
  connectivityProfile?: string;
}
export interface ProjectDetails {
  id: number;
  name: string;
  organization: number;
  isActive: boolean | null;
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: ProjectMetadata;
  sourceLanguageName: string;
  targetLanguageName: string;
  sourceName: string;
  chapterStatusCounts: ChapterStatusCounts;
  workflowConfig: WorkflowStep[];
}

const fetchProjectDetails = async (projectId: string): Promise<ProjectDetails> => {
  const res = await fetch(`${config.api.url}/projects/${projectId}`, {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) throw new Error('Failed to fetch project details');

  return (await res.json()) as ProjectDetails;
};

export const useProjectDetails = (projectId: string) => {
  return useQuery<ProjectDetails>({
    queryKey: ['projectDetails', projectId],
    queryFn: () => fetchProjectDetails(projectId),
    enabled: !!projectId,
  });
};
