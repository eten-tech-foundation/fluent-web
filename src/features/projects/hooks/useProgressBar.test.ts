import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import useProgressBar, { formatProgressPercentage } from '@/features/projects/hooks/useProgressBar';
import { type WorkflowStep } from '@/lib/types';

describe('formatProgressPercentage', () => {
  it('formats whole number percentages correctly', () => {
    expect(formatProgressPercentage(1, 1)).toBe('1%');
    expect(formatProgressPercentage(2, 2)).toBe('2%');
    expect(formatProgressPercentage(3, 3)).toBe('3%');
    expect(formatProgressPercentage(50, 50)).toBe('50%');
    expect(formatProgressPercentage(100, 100)).toBe('100%');
  });

  it('formats small percentages with ongoing work with exact decimal instead of rounding to 0 or 3', () => {
    expect(formatProgressPercentage(0.4, 1)).toBe('0.4%');
    expect(formatProgressPercentage(1.25, 1)).toBe('1.3%');
    expect(formatProgressPercentage(2.5, 1)).toBe('2.5%');
  });

  it('formats 0% when no count or 0 progress', () => {
    expect(formatProgressPercentage(0, 0)).toBe('0%');
  });

  it('formats large decimal percentages with standard rounding', () => {
    expect(formatProgressPercentage(33.333, 10)).toBe('33%');
    expect(formatProgressPercentage(66.666, 20)).toBe('67%');
  });
});

describe('useProgressBar', () => {
  const workflowConfig: WorkflowStep[] = [
    { id: 'not_started', label: 'Not Started' },
    { id: 'draft', label: 'Drafting' },
    { id: 'peer_check', label: 'Peer Check' },
    { id: 'community_review', label: 'Community Review' },
    { id: 'complete', label: 'Complete' },
  ];

  it('calculates segment percentages accurately without artificial inflation', () => {
    const { result } = renderHook(() => useProgressBar(workflowConfig));

    // 100 total chapters: 99 not started, 1 in draft (1%)
    const chapterStatusCounts = {
      not_started: 99,
      draft: 1,
    };

    const segments = result.current.calculateProgressSegments(chapterStatusCounts);
    const draftSegment = segments.find(s => s.status === 'draft');

    expect(draftSegment).toBeDefined();
    expect(draftSegment?.count).toBe(1);
    expect(draftSegment?.percentage).toBe(1);
    expect(draftSegment?.widthPercentage).toBe(1);
  });

  it('keeps widthPercentage dynamic when work progress is more than 3%', () => {
    const { result } = renderHook(() => useProgressBar(workflowConfig));

    // 100 total chapters: 80 not started, 20 in draft (20%)
    const chapterStatusCounts = {
      not_started: 80,
      draft: 20,
    };

    const segments = result.current.calculateProgressSegments(chapterStatusCounts);
    const draftSegment = segments.find(s => s.status === 'draft');

    expect(draftSegment).toBeDefined();
    expect(draftSegment?.count).toBe(20);
    expect(draftSegment?.percentage).toBe(20);
    expect(draftSegment?.widthPercentage).toBe(20);
  });

  it('preserves raw subsegment percentages and counts in advanced checks', () => {
    const customConfig: WorkflowStep[] = [
      { id: 'not_started', label: 'Not Started' },
      { id: 'draft', label: 'Drafting' },
      { id: 'peer_check', label: 'Peer Check' },
      { id: 'community_review', label: 'Community Review' },
      { id: 'linguist_check', label: 'Language Review' },
      { id: 'theological_check', label: 'Theological Check' },
      { id: 'complete', label: 'Complete' },
    ];
    const { result } = renderHook(() => useProgressBar(customConfig));

    // 250 chapters: 1 in linguist_check (0.4%), 10 in theological_check (4%)
    const chapterStatusCounts = {
      linguist_check: 1,
      theological_check: 10,
      complete: 239,
    };

    const segments = result.current.calculateProgressSegments(chapterStatusCounts);
    const advancedSegment = segments.find(s => s.status === 'advanced_check');

    expect(advancedSegment).toBeDefined();
    // Subsegments must follow configured order: linguist_check then theological_check
    expect(advancedSegment?.subSegments).toHaveLength(2);
    expect(advancedSegment?.subSegments?.[0]).toEqual({
      label: 'Language Review',
      percentage: 0.4,
      count: 1,
    });
    expect(advancedSegment?.subSegments?.[1]).toEqual({
      label: 'Theological Check',
      percentage: 4,
      count: 10,
    });
    // consultant_check was not configured and must not appear as a placeholder
    expect(advancedSegment?.subSegments?.find(s => s.label.includes('consultant'))).toBeUndefined();
  });

  it('falls back to default workflow steps when workflowConfig is empty or not provided', () => {
    const { result } = renderHook(() => useProgressBar([]));

    const chapterStatusCounts = {
      not_started: 10,
      draft: 10,
    };

    const segments = result.current.calculateProgressSegments(chapterStatusCounts);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.find(s => s.status === 'draft')?.count).toBe(10);

    const overall = result.current.calculateOverallProgress(chapterStatusCounts);
    expect(overall).toBeGreaterThan(0);
  });
});
