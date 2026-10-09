import { useProjectWorkflow } from '@/features/projects/hooks/useProjectWorkflow';

/**
 * Returns the configured display label for a given stage id (draft, peer_check, etc.)
 * in a project workflow. Falls back to default stage label if not found.
 */
export const useStageName = (projectId?: number | null, stageId?: string): string => {
  const { getStageLabel } = useProjectWorkflow(projectId);
  if (!stageId) return '';
  // Mapping for legacy 'drafting' -> 'draft'
  const normalizedId = stageId === 'drafting' ? 'draft' : stageId;
  return getStageLabel(normalizedId);
};
