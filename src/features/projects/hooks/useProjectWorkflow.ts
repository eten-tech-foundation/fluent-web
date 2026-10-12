import {
  QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';
import { ChapterAssignmentStatusDisplay } from '@/lib/types';

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
  { id: 'not_started', label: 'Not Started', enabled: true, isFixed: true },
  { id: 'draft', label: 'Draft', roleName: 'Drafter', enabled: true, isFixed: true },
  { id: 'peer_check', label: 'Peer Check', roleName: 'Peer Checker', enabled: true, isFixed: true },
  {
    id: 'community_review',
    label: 'Community Review',
    roleName: 'Community Reviewer',
    enabled: true,
  },
  { id: 'linguist_check', label: 'Linguist Check', roleName: 'Linguist', enabled: true },
  { id: 'theological_check', label: 'Theological Check', roleName: 'Theologian', enabled: true },
  { id: 'consultant_check', label: 'Consultant Check', roleName: 'Consultant', enabled: true },
  { id: 'complete', label: 'Complete', enabled: true, isFixed: true },
];

const fallbackQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

export const fetchProjectWorkflow = async (projectId?: number | null): Promise<WorkflowStep[]> => {
  if (!projectId) return DEFAULT_WORKFLOW_STEPS;
  try {
    // Try fetching from dedicated /projects/:projectId/workflow-stages endpoint
    const stagesRes = await fetch(`${config.api.url}/projects/${projectId}/workflow-stages`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
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
    const response = await fetch(`${config.api.url}/projects/${projectId}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
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
  let queryClient: QueryClient;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    queryClient = useQueryClient();
  } catch {
    queryClient = fallbackQueryClient;
  }

  return useQueries(
    {
      queries: projectIds.map(id => ({
        queryKey: ['project-workflow', id],
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
  let queryClient: QueryClient;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    queryClient = useQueryClient();
  } catch {
    // Isolated unit tests rendering component without QueryClientProvider
    queryClient = fallbackQueryClient;
  }

  const query = useQuery(
    {
      queryKey: ['project-workflow', projectId],
      queryFn: () => fetchProjectWorkflow(projectId),
      enabled: !!projectId,
    },
    queryClient
  );

  const invalidateQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['project-workflow', projectId] }),
      queryClient.invalidateQueries({ queryKey: ['projectDetails', String(projectId)] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  };

  const addStageMutation = useMutation(
    {
      mutationFn: async (displayName: string) => {
        if (!projectId) throw new Error('Project ID required');
        const res = await fetch(`${config.api.url}/projects/${projectId}/workflow-stages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName }),
        });
        if (!res.ok) throw new Error('Failed to add stage');
        return (await res.json()) as Record<string, unknown>;
      },
      onSuccess: invalidateQueries,
    },
    queryClient
  );

  const renameStageMutation = useMutation(
    {
      mutationFn: async ({ stageId, displayName }: { stageId: number; displayName: string }) => {
        if (!projectId) throw new Error('Project ID required');
        const res = await fetch(
          `${config.api.url}/projects/${projectId}/workflow-stages/${stageId}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName }),
          }
        );
        if (!res.ok) throw new Error('Failed to rename stage');
        return (await res.json()) as Record<string, unknown>;
      },
      onSuccess: invalidateQueries,
    },
    queryClient
  );

  const deleteStageMutation = useMutation(
    {
      mutationFn: async (stageId: number) => {
        if (!projectId) throw new Error('Project ID required');
        const res = await fetch(
          `${config.api.url}/projects/${projectId}/workflow-stages/${stageId}`,
          {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        if (!res.ok) throw new Error('Failed to delete stage');
        return (await res.json()) as Record<string, unknown>;
      },
      onSuccess: invalidateQueries,
    },
    queryClient
  );

  const reorderStagesMutation = useMutation(
    {
      mutationFn: async (stageIds: number[]) => {
        if (!projectId) throw new Error('Project ID required');
        const res = await fetch(`${config.api.url}/projects/${projectId}/workflow-stages/reorder`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageIds }),
        });
        if (!res.ok) throw new Error('Failed to reorder stages');
        return (await res.json()) as Record<string, unknown>;
      },
      onSuccess: invalidateQueries,
    },
    queryClient
  );

  const updateMutation = useMutation(
    {
      mutationFn: async (workflowConfig: WorkflowStep[]) => {
        if (!projectId) throw new Error('Project ID required');

        // Sync directly against dedicated /projects/:projectId/workflow-stages endpoints
        const initialSteps = query.data;
        if (
          !initialSteps ||
          initialSteps === DEFAULT_WORKFLOW_STEPS ||
          !initialSteps.some(step => step.stageId !== undefined)
        ) {
          throw new Error(
            'Cannot save workflow before its configuration is loaded from the server'
          );
        }

        interface ApiErrorResponse {
          message?: string;
        }

        const parseErrorMessage = async (res: Response, fallback: string): Promise<string> => {
          try {
            const data = (await res.json()) as ApiErrorResponse;
            return data.message ?? fallback;
          } catch {
            return fallback;
          }
        };

        // 1. Delete removed stages
        const finalStageIds = new Set(workflowConfig.map(s => s.stageId).filter(Boolean));
        for (const step of initialSteps) {
          if (step.stageId && !finalStageIds.has(step.stageId) && !step.isFixed) {
            const delRes = await fetch(
              `${config.api.url}/projects/${projectId}/workflow-stages/${step.stageId}`,
              {
                method: 'DELETE',
                credentials: 'include',
              }
            );
            if (!delRes.ok) {
              throw new Error(
                await parseErrorMessage(delRes, `Failed to delete stage "${step.label}"`)
              );
            }
          }
        }

        // 2. Add new stages & rename modified stages
        const activeStageIds: number[] = [];
        for (const step of workflowConfig) {
          if (!step.stageId && step.id !== 'not_started' && step.id !== 'complete') {
            // New stage
            const addRes = await fetch(`${config.api.url}/projects/${projectId}/workflow-stages`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ displayName: step.label }),
            });
            if (!addRes.ok) {
              throw new Error(
                await parseErrorMessage(addRes, `Failed to add stage "${step.label}"`)
              );
            }
            const created = (await addRes.json()) as { stageId?: number };
            if (created.stageId) activeStageIds.push(created.stageId);
          } else {
            const targetStageId = step.stageId ?? initialSteps.find(s => s.id === step.id)?.stageId;
            if (targetStageId) {
              activeStageIds.push(targetStageId);
              // Check if renamed (allowed for any stage except bookends: not_started, complete)
              const original = initialSteps.find(
                s => s.stageId === targetStageId || s.id === step.id
              );
              if (
                original &&
                original.label !== step.label &&
                step.id !== 'not_started' &&
                step.id !== 'complete'
              ) {
                const patchRes = await fetch(
                  `${config.api.url}/projects/${projectId}/workflow-stages/${targetStageId}`,
                  {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ displayName: step.label }),
                  }
                );
                if (!patchRes.ok) {
                  throw new Error(
                    await parseErrorMessage(patchRes, `Failed to rename stage to "${step.label}"`)
                  );
                }
              }
            }
          }
        }

        // 3. Reorder if numeric IDs available
        if (activeStageIds.length > 0) {
          const reorderRes = await fetch(
            `${config.api.url}/projects/${projectId}/workflow-stages/reorder`,
            {
              method: 'PUT',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stageIds: activeStageIds }),
            }
          );
          if (!reorderRes.ok) {
            throw new Error(await parseErrorMessage(reorderRes, 'Failed to reorder stages'));
          }
        }
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
    if (found?.roleName) return found.roleName;
    return fallback ?? roleId;
  };

  const isStageEnabled = (stageId: string): boolean => {
    const found = workflowConfig.find(step => step.id === stageId);
    if (!found) return true;
    return found.enabled !== false;
  };

  const enabledStages = workflowConfig.filter(step => step.enabled !== false);

  const isLoadedFromServer = Boolean(
    query.isSuccess &&
    query.data !== DEFAULT_WORKFLOW_STEPS &&
    query.data.some(step => step.stageId !== undefined)
  );

  return {
    ...query,
    workflowConfig,
    enabledStages,
    isLoadedFromServer,
    getStageLabel,
    getRoleLabel,
    isStageEnabled,
    updateWorkflowConfig: updateMutation.mutateAsync,
    addStage: addStageMutation.mutateAsync,
    renameStage: renameStageMutation.mutateAsync,
    deleteStage: deleteStageMutation.mutateAsync,
    reorderStages: reorderStagesMutation.mutateAsync,
    isUpdating:
      updateMutation.isPending ||
      addStageMutation.isPending ||
      renameStageMutation.isPending ||
      deleteStageMutation.isPending ||
      reorderStagesMutation.isPending,
  };
}
