import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { parseErrorMessage } from '@/lib/api-utils';
import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { ChapterAssignmentStatus, ChapterAssignmentStatusDisplay } from '@/lib/types';

export interface WorkflowStep {
  id: string;
  label: string;
  stageId?: number;
  position?: number;
  isFixed?: boolean;
  isLocked?: boolean;
  roleName?: string;
  enabled?: boolean;
  order?: number;
}

export const DEFAULT_WORKFLOW_STEPS: WorkflowStep[] = [
  { id: ChapterAssignmentStatus.NOT_STARTED, label: 'Not Started', enabled: true, isFixed: true },
  {
    id: ChapterAssignmentStatus.DRAFT,
    label: 'Drafting',
    roleName: 'Drafting',
    enabled: true,
    isFixed: true,
  },
  {
    id: ChapterAssignmentStatus.PEER_CHECK,
    label: 'Peer Check',
    roleName: 'Peer Check',
    enabled: true,
    isFixed: true,
  },
  {
    id: ChapterAssignmentStatus.COMMUNITY_REVIEW,
    label: 'Community Review',
    roleName: 'Community Review',
    enabled: true,
  },
  {
    id: ChapterAssignmentStatus.LINGUIST_CHECK,
    label: 'Linguist Check',
    roleName: 'Linguist Check',
    enabled: true,
  },
  {
    id: ChapterAssignmentStatus.THEOLOGICAL_CHECK,
    label: 'Theological Check',
    roleName: 'Theological Check',
    enabled: true,
  },
  {
    id: ChapterAssignmentStatus.CONSULTANT_CHECK,
    label: 'Consultant Check',
    roleName: 'Consultant Check',
    enabled: true,
  },
  { id: ChapterAssignmentStatus.COMPLETE, label: 'Complete', enabled: true, isFixed: true },
];

export const projectWorkflowKey = (projectId?: number | string | null) =>
  ['project-workflow', projectId != null ? Number(projectId) : null] as const;

export const apiFetch = async (path: string, options: RequestInit = {}) => {
  return fetch(`${config.api.url}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
};

export const addWorkflowStageApi = async (projectId: number, displayName: string) => {
  const res = await apiFetch(`/projects/${projectId}/workflow-stages`, {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) await parseErrorMessage(res, 'Failed to add stage');
  return (await res.json()) as { stageId?: number; label?: string; id?: string };
};

export const renameWorkflowStageApi = async (
  projectId: number,
  stageId: number,
  displayName: string
) => {
  const res = await apiFetch(`/projects/${projectId}/workflow-stages/${stageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) await parseErrorMessage(res, `Failed to rename stage to "${displayName}"`);
  return (await res.json()) as Record<string, unknown>;
};

export const deleteWorkflowStageApi = async (projectId: number, stageId: number) => {
  const res = await apiFetch(`/projects/${projectId}/workflow-stages/${stageId}`, {
    method: 'DELETE',
  });
  if (!res.ok) await parseErrorMessage(res, 'Failed to delete stage');
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
};

export const reorderWorkflowStagesApi = async (projectId: number, stageIds: number[]) => {
  const res = await apiFetch(`/projects/${projectId}/workflow-stages/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ stageIds }),
  });
  if (!res.ok) await parseErrorMessage(res, 'Failed to reorder stages');
  return (await res.json()) as Record<string, unknown>;
};

export const fetchProjectWorkflow = async (projectId?: number | null): Promise<WorkflowStep[]> => {
  if (!projectId) return DEFAULT_WORKFLOW_STEPS;
  try {
    // Try fetching from dedicated /projects/:projectId/workflow-stages endpoint
    const stagesRes = await apiFetch(`/projects/${projectId}/workflow-stages`, {
      method: 'GET',
    }).catch(() => null);

    if (stagesRes?.ok) {
      interface ApiWorkflowStage {
        id: string;
        label: string;
        stageId?: number;
        position?: number;
        isFixed?: boolean;
        isLocked?: boolean;
      }
      const stagesData = (await stagesRes.json()) as ApiWorkflowStage[];
      if (Array.isArray(stagesData) && stagesData.length > 0) {
        return stagesData.map(s => ({
          id: s.id,
          label: s.label,
          stageId: s.stageId,
          position: s.position,
          isFixed: s.isFixed,
          isLocked: s.isLocked,
          roleName: s.label,
          enabled: true,
        })) as WorkflowStep[];
      }
    }

    // Fallback to GET /projects/:projectId
    const response = await apiFetch(`/projects/${projectId}`, {
      method: 'GET',
    });
    if (response.ok) {
      const data = (await response.json()) as { workflowConfig?: WorkflowStep[] };
      if (
        data.workflowConfig &&
        Array.isArray(data.workflowConfig) &&
        data.workflowConfig.length > 0
      ) {
        return data.workflowConfig;
      }
    }
  } catch (err) {
    Logger.warn('Failed to fetch project workflow config, falling back to defaults', {
      error: String(err),
    });
  }
  return DEFAULT_WORKFLOW_STEPS;
};

export function useProjectsWorkflows(projectIds: number[]) {
  const queryClient = useQueryClient();

  return useQueries(
    {
      queries: projectIds.map(id => ({
        queryKey: projectWorkflowKey(id),
        queryFn: () => fetchProjectWorkflow(id),
        staleTime: 5 * 60 * 1000,
        enabled: id > 0,
      })),
      combine: results => {
        const map = new Map<number, WorkflowStep[]>();
        projectIds.forEach((id, index) => {
          map.set(id, results[index]?.data ?? DEFAULT_WORKFLOW_STEPS);
        });
        return map;
      },
    },
    queryClient
  );
}

export function useProjectWorkflow(projectId?: number | null) {
  const queryClient = useQueryClient();

  const query = useQuery(
    {
      queryKey: projectWorkflowKey(projectId),
      queryFn: () => fetchProjectWorkflow(projectId),
      staleTime: 5 * 60 * 1000,
      enabled: !!projectId,
    },
    queryClient
  );

  const invalidateQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectWorkflowKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: ['projectDetails', String(projectId)] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  };

  const addStageMutation = useMutation(
    {
      mutationFn: async (displayName: string) => {
        if (!projectId) throw new Error('Project ID required');
        return addWorkflowStageApi(projectId, displayName);
      },
      onSuccess: invalidateQueries,
    },
    queryClient
  );

  const renameStageMutation = useMutation(
    {
      mutationFn: async ({ stageId, displayName }: { stageId: number; displayName: string }) => {
        if (!projectId) throw new Error('Project ID required');
        return renameWorkflowStageApi(projectId, stageId, displayName);
      },
      onSuccess: invalidateQueries,
    },
    queryClient
  );

  const deleteStageMutation = useMutation(
    {
      mutationFn: async (stageId: number) => {
        if (!projectId) throw new Error('Project ID required');
        return deleteWorkflowStageApi(projectId, stageId);
      },
      onSuccess: invalidateQueries,
    },
    queryClient
  );

  const reorderStagesMutation = useMutation(
    {
      mutationFn: async (stageIds: number[]) => {
        if (!projectId) throw new Error('Project ID required');
        return reorderWorkflowStagesApi(projectId, stageIds);
      },
      onSuccess: invalidateQueries,
    },
    queryClient
  );

  const workflowConfig = query.data ?? DEFAULT_WORKFLOW_STEPS;

  const getStageLabel = (stageId: string, fallback?: string): string => {
    const found = workflowConfig.find(step => step.id === stageId);
    if (found?.label) return found.label;
    if (fallback) return fallback;
    return (ChapterAssignmentStatusDisplay as Record<string, string>)[stageId] || stageId;
  };

  const getRoleLabel = (roleId: string, fallback?: string): string => {
    const found = workflowConfig.find(step => step.id === roleId || step.roleName === roleId);
    if (found?.label) return found.label;
    if (found?.roleName) return found.roleName;
    return fallback ?? roleId;
  };

  const isLoadedFromServer = Boolean(
    query.isSuccess &&
    query.data !== DEFAULT_WORKFLOW_STEPS &&
    query.data.some(step => step.stageId !== undefined)
  );

  return {
    ...query,
    workflowConfig,
    isLoadedFromServer,
    getStageLabel,
    getRoleLabel,
    addStage: addStageMutation.mutateAsync,
    renameStage: renameStageMutation.mutateAsync,
    deleteStage: deleteStageMutation.mutateAsync,
    reorderStages: reorderStagesMutation.mutateAsync,
    isUpdating:
      addStageMutation.isPending ||
      renameStageMutation.isPending ||
      deleteStageMutation.isPending ||
      reorderStagesMutation.isPending,
  };
}
