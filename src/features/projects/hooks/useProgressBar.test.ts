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

  it('enforces a minimum width of 3% for stages with ongoing work under 3%', () => {
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
    expect(draftSegment?.percentage).toBe(1); // exact percentage
    expect(draftSegment?.widthPercentage).toBe(3); // minimum 3% width for visibility/hover
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
    expect(draftSegment?.widthPercentage).toBe(20); // dynamic
  });

  it('handles multiple stages with small percentages by giving each min 3% width while retaining exact percentages', () => {
    const { result } = renderHook(() => useProgressBar(workflowConfig));

    // 100 total: 98 not started, 1 draft (1%), 1 peer_check (1%)
    const chapterStatusCounts = {
      not_started: 98,
      draft: 1,
      peer_check: 1,
    };

    const segments = result.current.calculateProgressSegments(chapterStatusCounts);
    const draftSegment = segments.find(s => s.status === 'draft');
    const peerCheckSegment = segments.find(s => s.status === 'peer_check');

    expect(draftSegment?.percentage).toBe(1);
    expect(draftSegment?.widthPercentage).toBe(3);

    expect(peerCheckSegment?.percentage).toBe(1);
    expect(peerCheckSegment?.widthPercentage).toBe(3);
  });
});
