import { useCallback, useMemo } from 'react';

import {
  ADVANCED_CHECK_SUB_LABELS,
  ADVANCED_CHECK_SUB_STATUSES,
  ChapterAssignmentStatus,
  type WorkflowStep,
} from '@/lib/types';

interface ColorInfo {
  color: string;
  displayName: string;
}

interface ProgressSubSegment {
  label: string;
  percentage: number;
}

interface ProgressSegment {
  status: string;
  displayName: string;
  count: number;
  widthPercentage: number;
  color: string;
  subSegments?: ProgressSubSegment[];
}

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

const distributeRoundedPercentages = (rawValues: number[], targetTotal: number): number[] => {
  const floors = rawValues.map(v => Math.floor(v));
  const remainder = targetTotal - floors.reduce((sum, v) => sum + v, 0);

  const byFraction = rawValues
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < remainder && k < byFraction.length; k++) {
    result[byFraction[k].i] += 1;
  }
  return result;
};

const useProgressBar = (workflowConfig: WorkflowStep[] = []) => {
  // Determine the last index among the core trio in workflowConfig
  const lastCoreIndex = useMemo(() => {
    let lastIdx = -1;
    workflowConfig.forEach((step, idx) => {
      if (CORE_TRIO.includes(step.id)) {
        lastIdx = Math.max(lastIdx, idx);
      }
    });
    return lastIdx;
  }, [workflowConfig]);

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

    workflowConfig.forEach((step, idx) => {
      colorMap[step.id] = {
        color: getPhaseColor(step.id, idx),
        displayName: getPhaseDisplayName(step.id, step.label, idx),
      };
    });

    return colorMap;
  }, [workflowConfig, getPhaseColor, getPhaseDisplayName]);

  const legendItems = useMemo<LegendItem[]>(() => {
    const seenKeys = new Set<string>();
    const items: LegendItem[] = [];

    [...workflowConfig].reverse().forEach(step => {
      const idx = workflowConfig.findIndex(s => s.id === step.id);
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
  }, [workflowConfig, getPhaseKey, getPhaseColor, getPhaseDisplayName]);

  const calculateProgressSegments = useCallback(
    (chapterStatusCounts: Record<string, number>): ProgressSegment[] => {
      const totalChapters = Object.values(chapterStatusCounts).reduce(
        (sum, count) => sum + count,
        0
      );

      if (totalChapters === 0) return [];

      const reversedConfig = [...workflowConfig].reverse();
      const segmentsByKey = new Map<string, ProgressSegment>();

      reversedConfig.forEach(step => {
        const idx = workflowConfig.findIndex(s => s.id === step.id);
        const key = getPhaseKey(step.id, idx);
        const count = chapterStatusCounts[step.id] ?? 0;
        const stepColor = colors[step.id];

        const existing = segmentsByKey.get(key);
        if (existing) {
          existing.count += count;
          existing.widthPercentage = (existing.count / totalChapters) * 100;
          return;
        }
        segmentsByKey.set(key, {
          status: key,
          displayName: stepColor.displayName,
          count,
          widthPercentage: (count / totalChapters) * 100,
          color: stepColor.color,
        });
      });

      const advancedSegment = segmentsByKey.get(ADVANCED_CHECK_KEY);
      if (advancedSegment) {
        const collapsedSteps = reversedConfig.filter(
          step =>
            getPhaseKey(
              step.id,
              workflowConfig.findIndex(s => s.id === step.id)
            ) === ADVANCED_CHECK_KEY
        );

        const orderedSteps: WorkflowStep[] = [
          ...ADVANCED_CHECK_SUB_STATUSES.map(
            status => collapsedSteps.find(s => s.id === status) ?? { id: status, label: status }
          ),
          ...collapsedSteps.filter(
            s => !ADVANCED_CHECK_SUB_STATUSES.includes(s.id as ChapterAssignmentStatus)
          ),
        ];

        const rawPercentages = orderedSteps.map(
          step => ((chapterStatusCounts[step.id] ?? 0) / totalChapters) * 100
        );
        const roundedTotal = Math.round(advancedSegment.widthPercentage);
        const roundedPercentages = distributeRoundedPercentages(rawPercentages, roundedTotal);

        advancedSegment.subSegments = orderedSteps.map((step, index) => ({
          label: ADVANCED_CHECK_SUB_LABELS[step.id as ChapterAssignmentStatus] ?? step.label,
          percentage: roundedPercentages[index],
        }));
      }

      return Array.from(segmentsByKey.values()).filter(segment => segment.count > 0);
    },
    [workflowConfig, colors, getPhaseKey]
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
      const steps = workflowConfig.map(s => s.id);

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
    [workflowConfig]
  );

  return {
    colors,
    legendItems,
    calculateProgressSegments,
    calculateOverallProgress,
  };
};

export default useProgressBar;
