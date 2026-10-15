import { useCallback, useMemo } from 'react';

import { DEFAULT_WORKFLOW_STEPS } from '@/features/projects/hooks/useProjectWorkflow';
import { ADVANCED_CHECK_SUB_LABELS, ChapterAssignmentStatus, type WorkflowStep } from '@/lib/types';

interface ColorInfo {
  color: string;
  displayName: string;
}

export interface ProgressSubSegment {
  label: string;
  percentage: number;
  count: number;
}

export interface ProgressSegment {
  status: string;
  displayName: string;
  count: number;
  percentage: number;
  widthPercentage: number;
  color: string;
  subSegments?: ProgressSubSegment[];
}

export const formatProgressPercentage = (percentage: number, count = 0): string => {
  if (count > 0 && percentage > 0 && percentage < 3) {
    if (percentage % 1 === 0) {
      return `${percentage}%`;
    }
    return `${Number(percentage.toFixed(1))}%`;
  }
  return `${Math.round(percentage)}%`;
};

interface LegendItem {
  key: string;
  color: string;
  displayName: string;
}

const LIME_COLOR = 'var(--workflow-custom-stage)';

const PHASE_COLORS: Partial<Record<ChapterAssignmentStatus, string>> = {
  [ChapterAssignmentStatus.NOT_STARTED]: 'var(--workflow-not-started)',
  [ChapterAssignmentStatus.DRAFT]: 'var(--workflow-drafting)',
  [ChapterAssignmentStatus.PEER_CHECK]: 'var(--workflow-peer-check)',
  [ChapterAssignmentStatus.COMMUNITY_REVIEW]: 'var(--workflow-community-review)',
  [ChapterAssignmentStatus.COMPLETE]: 'var(--workflow-complete)',
};

const PHASE_DISPLAY_NAMES: Partial<Record<ChapterAssignmentStatus, string>> = {
  [ChapterAssignmentStatus.NOT_STARTED]: 'Not Started',
  [ChapterAssignmentStatus.DRAFT]: 'Drafting',
  [ChapterAssignmentStatus.PEER_CHECK]: 'Peer Check',
  [ChapterAssignmentStatus.COMMUNITY_REVIEW]: 'Community Review',
  [ChapterAssignmentStatus.COMPLETE]: 'Complete',
};

const ADVANCED_CHECK_COLOR = 'var(--workflow-advanced-check)';
const ADVANCED_CHECK_KEY = 'advanced_check';
const ADVANCED_CHECK_LABEL = 'Advanced Checks';

const CORE_TRIO = ['draft', 'peer_check', 'community_review'];

const useProgressBar = (workflowConfig: WorkflowStep[] = []) => {
  const effectiveConfig = useMemo(() => {
    return workflowConfig && workflowConfig.length > 0 ? workflowConfig : DEFAULT_WORKFLOW_STEPS;
  }, [workflowConfig]);

  // Determine the last index among the core trio in workflowConfig
  const lastCoreIndex = useMemo(() => {
    let lastIdx = -1;
    effectiveConfig.forEach((step, idx) => {
      if (CORE_TRIO.includes(step.id)) {
        lastIdx = Math.max(lastIdx, idx);
      }
    });
    return lastIdx;
  }, [effectiveConfig]);

  const getPhaseKey = useCallback(
    (stepId: string, index: number): string => {
      if (stepId in PHASE_COLORS) return stepId;
      if (index !== -1 && lastCoreIndex !== -1 && index < lastCoreIndex) {
        return stepId; // Custom stage before last core stage gets its own segment
      }
      return ADVANCED_CHECK_KEY;
    },
    [lastCoreIndex]
  );

  const getPhaseColor = useCallback(
    (stepId: string, index: number): string => {
      if (stepId in PHASE_COLORS) {
        return PHASE_COLORS[stepId as ChapterAssignmentStatus] ?? LIME_COLOR;
      }
      const key = getPhaseKey(stepId, index);
      if (key === ADVANCED_CHECK_KEY) return ADVANCED_CHECK_COLOR;
      return LIME_COLOR;
    },
    [getPhaseKey]
  );

  const getPhaseDisplayName = useCallback(
    (stepId: string, fallbackLabel: string, index: number): string => {
      const key = getPhaseKey(stepId, index);
      if (key === ADVANCED_CHECK_KEY) return ADVANCED_CHECK_LABEL;
      if (fallbackLabel && fallbackLabel.trim() !== '') {
        return fallbackLabel;
      }
      if (stepId in PHASE_DISPLAY_NAMES) {
        return PHASE_DISPLAY_NAMES[stepId as ChapterAssignmentStatus] ?? stepId;
      }
      return stepId;
    },
    [getPhaseKey]
  );

  const colors = useMemo(() => {
    const colorMap: Record<string, ColorInfo> = {};

    effectiveConfig.forEach((step, idx) => {
      colorMap[step.id] = {
        color: getPhaseColor(step.id, idx),
        displayName: getPhaseDisplayName(step.id, step.label, idx),
      };
    });

    return colorMap;
  }, [effectiveConfig, getPhaseColor, getPhaseDisplayName]);

  const legendItems = useMemo<LegendItem[]>(() => {
    const seenKeys = new Set<string>();
    const items: LegendItem[] = [];

    [...effectiveConfig].reverse().forEach(step => {
      const idx = effectiveConfig.findIndex(s => s.id === step.id);
      const key = getPhaseKey(step.id, idx);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      items.push({
        key,
        color: getPhaseColor(step.id, idx),
        displayName: getPhaseDisplayName(step.id, step.label, idx),
      });
    });

    return items;
  }, [effectiveConfig, getPhaseKey, getPhaseColor, getPhaseDisplayName]);

  const calculateProgressSegments = useCallback(
    (chapterStatusCounts: Record<string, number>): ProgressSegment[] => {
      const totalChapters = Object.values(chapterStatusCounts).reduce(
        (sum, count) => sum + count,
        0
      );

      if (totalChapters === 0) return [];

      const reversedConfig = [...effectiveConfig].reverse();
      const segmentsByKey = new Map<string, ProgressSegment>();

      reversedConfig.forEach(step => {
        const idx = effectiveConfig.findIndex(s => s.id === step.id);
        const key = getPhaseKey(step.id, idx);
        const count = chapterStatusCounts[step.id] ?? 0;
        const stepColor = colors[step.id];
        const displayName = stepColor.displayName;
        const color = stepColor.color;

        const existing = segmentsByKey.get(key);
        if (existing) {
          existing.count += count;
          existing.percentage = (existing.count / totalChapters) * 100;
          existing.widthPercentage = existing.percentage;
          return;
        }
        const percentage = (count / totalChapters) * 100;
        segmentsByKey.set(key, {
          status: key,
          displayName,
          count,
          percentage,
          widthPercentage: percentage,
          color,
        });
      });

      // Include any statuses in chapterStatusCounts not covered in effectiveConfig
      Object.entries(chapterStatusCounts).forEach(([status, count]) => {
        if (!effectiveConfig.some(s => s.id === status) && count > 0) {
          const key = status;
          const percentage = (count / totalChapters) * 100;
          segmentsByKey.set(key, {
            status: key,
            displayName: status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            count,
            percentage,
            widthPercentage: percentage,
            color: LIME_COLOR,
          });
        }
      });

      const advancedSegment = segmentsByKey.get(ADVANCED_CHECK_KEY);
      if (advancedSegment) {
        const collapsedSteps = effectiveConfig.filter(
          (step, idx) => getPhaseKey(step.id, idx) === ADVANCED_CHECK_KEY
        );

        advancedSegment.subSegments = collapsedSteps.map(step => {
          const count = chapterStatusCounts[step.id] ?? 0;
          const percentage = totalChapters > 0 ? (count / totalChapters) * 100 : 0;
          return {
            label: step.label.trim()
              ? step.label
              : (ADVANCED_CHECK_SUB_LABELS[step.id as ChapterAssignmentStatus] ?? step.id),
            percentage,
            count,
          };
        });
      }

      return Array.from(segmentsByKey.values()).filter(segment => segment.count > 0);
    },
    [effectiveConfig, colors, getPhaseKey]
  );

  const calculateOverallProgress = useCallback(
    (chapterStatusCounts: Record<string, number>): number => {
      const totalChapters = Object.values(chapterStatusCounts).reduce(
        (sum, count) => sum + Number(count),
        0
      );

      if (totalChapters === 0) return 0;

      // Filter out not_started to avoid giving it weight (it's 0 progress)
      // The workflow steps are ordered from start to finish
      const steps = effectiveConfig.map(s => s.id);

      let totalWeightedProgress = 0;

      Object.entries(chapterStatusCounts).forEach(([status, count]) => {
        const stepIndex = steps.indexOf(status);
        if (stepIndex > 0) {
          // stepIndex 0 is typically not_started, weight = 0
          // Weight is index / (total steps - 1)
          const weight = stepIndex / Math.max(1, steps.length - 1);
          totalWeightedProgress += Number(count) * weight;
        }
      });

      return (totalWeightedProgress / totalChapters) * 100;
    },
    [effectiveConfig]
  );

  return {
    colors,
    legendItems,
    calculateProgressSegments,
    calculateOverallProgress,
  };
};

export default useProgressBar;
