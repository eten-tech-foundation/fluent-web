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

const PHASE_COLORS: Partial<Record<ChapterAssignmentStatus, string>> = {
  [ChapterAssignmentStatus.NOT_STARTED]: 'var(--workflow-not-started)',
  [ChapterAssignmentStatus.DRAFT]: 'var(--workflow-drafting)',
  [ChapterAssignmentStatus.PEER_CHECK]: 'var(--workflow-peer-check)',
  [ChapterAssignmentStatus.COMMUNITY_REVIEW]: 'var(--workflow-community-review)',
  [ChapterAssignmentStatus.COMPLETE]: 'var(--workflow-complete)',
};

// Display names for the bar/legend. Kept separate from each step's own
// `label` so that multiple advanced-check sub-stages (linguist check,
// theological check, consultant check, etc.) collapse into a single
// "Advanced Checks" entry instead of one row per configured step.
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
const getPhaseKey = (stepId: string): string =>
  stepId in PHASE_COLORS ? stepId : ADVANCED_CHECK_KEY;

const getPhaseColor = (stepId: string): string =>
  PHASE_COLORS[stepId as ChapterAssignmentStatus] ?? ADVANCED_CHECK_COLOR;

const getPhaseDisplayName = (stepId: string, fallbackLabel: string): string =>
  PHASE_DISPLAY_NAMES[stepId as ChapterAssignmentStatus] ??
  (getPhaseKey(stepId) === ADVANCED_CHECK_KEY ? ADVANCED_CHECK_LABEL : fallbackLabel);

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
  const colors = useMemo(() => {
    const colorMap: Record<string, ColorInfo> = {};

    workflowConfig.forEach(step => {
      colorMap[step.id] = {
        color: getPhaseColor(step.id),
        displayName: getPhaseDisplayName(step.id, step.label),
      };
    });

    return colorMap;
  }, [workflowConfig]);

  const legendItems = useMemo<LegendItem[]>(() => {
    const seenKeys = new Set<string>();
    const items: LegendItem[] = [];

    [...workflowConfig].reverse().forEach(step => {
      const key = getPhaseKey(step.id);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      items.push({
        key,
        color: getPhaseColor(step.id),
        displayName: getPhaseDisplayName(step.id, step.label),
      });
    });

    return items;
  }, [workflowConfig]);

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
        const key = getPhaseKey(step.id);
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
          step => getPhaseKey(step.id) === ADVANCED_CHECK_KEY
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
    [workflowConfig, colors]
  );

  return {
    colors,
    legendItems,
    calculateProgressSegments,
  };
};

export default useProgressBar;
