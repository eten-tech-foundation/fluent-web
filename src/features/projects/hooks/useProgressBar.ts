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
        advancedSegment.subSegments = ADVANCED_CHECK_SUB_STATUSES.map(subStatus => ({
          label: ADVANCED_CHECK_SUB_LABELS[subStatus] ?? subStatus,
          percentage: ((chapterStatusCounts[subStatus] ?? 0) / totalChapters) * 100,
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
