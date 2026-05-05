import { useCallback, useMemo } from 'react';

import { type WorkflowStep } from '@/lib/types';

interface ColorInfo {
  color: string;
  opacity: number;
  rgba: string;
  percentage: number;
  displayName: string;
}

interface ProgressSegment {
  status: string;
  displayName: string;
  count: number;
  widthPercentage: number;
  color: string;
  opacity: number;
}

const useProgressBar = (workflowConfig: WorkflowStep[] = []) => {
  const colors = useMemo(() => {
    const totalSteps = workflowConfig.length;
    const colorMap: Record<string, ColorInfo> = {};
    const minOpacity = 0.1;
    const maxOpacity = 1.0;
    const opacityRange = maxOpacity - minOpacity;
    const denominator = Math.max(totalSteps - 1, 1);
    const increment = opacityRange / denominator;

    workflowConfig.forEach((step, index) => {
      const opacity = minOpacity + increment * index;
      const percentage = Math.round(opacity * 100);

      colorMap[step.id] = {
        color: 'var(--primary)',
        opacity,
        rgba: `color-mix(in srgb, var(--primary) ${percentage}%, transparent)`,
        percentage,
        displayName: step.label,
      };
    });

    return colorMap;
  }, [workflowConfig]);

  const calculateProgressSegments = useCallback(
    (chapterStatusCounts: Record<string, number>): ProgressSegment[] => {
      const totalChapters = Object.values(chapterStatusCounts).reduce(
        (sum, count) => sum + count,
        0
      );

      if (totalChapters === 0) return [];

      const reversedConfig = [...workflowConfig].reverse();

      return reversedConfig
        .map(step => {
          const count = chapterStatusCounts[step.id] ?? 0;
          const widthPercentage = (count / totalChapters) * 100;
          const stepColor = colors[step.id];

          return {
            status: step.id,
            displayName: stepColor.displayName,
            count,
            widthPercentage,
            color: stepColor.rgba,
            opacity: stepColor.opacity,
          };
        })
        .filter((segment): segment is ProgressSegment => segment.count > 0);
    },
    [workflowConfig, colors]
  );

  return {
    colors,
    calculateProgressSegments,
  };
};

export default useProgressBar;
