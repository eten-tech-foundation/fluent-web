import { describe, expect, it } from 'vitest';

import { DEFAULT_WORKFLOW_STEPS } from '@/features/projects/hooks/useProjectWorkflow';
import { renderWithProviders, screen } from '@/test/render';

import { CardProgressBar } from './CardProgressBar';

describe('CardProgressBar', () => {
  const chapterCounts = {
    not_started: 49,
    draft: 1,
  };

  it('renders default variant with progress bar track and legend', () => {
    renderWithProviders(
      <CardProgressBar
        chapterStatusCounts={chapterCounts}
        workflowConfig={DEFAULT_WORKFLOW_STEPS}
      />
    );

    expect(screen.getByText('Not Started')).toBeInTheDocument();
    expect(screen.getByText('Drafting')).toBeInTheDocument();
  });

  it('renders mini variant with exact small decimal progress percentage instead of 0%', () => {
    // 50 total chapters, 1 in drafting (weighted progress ~0.3%)
    renderWithProviders(
      <CardProgressBar
        chapterStatusCounts={chapterCounts}
        variant='mini'
        workflowConfig={DEFAULT_WORKFLOW_STEPS}
      />
    );

    // formatProgressPercentage formats <3% with decimal (0.3%) instead of Math.round(0.3) = 0%
    expect(screen.getByText('0.3%')).toBeInTheDocument();
  });

  it('renders mini variant with 0% when there is no progress', () => {
    renderWithProviders(
      <CardProgressBar
        chapterStatusCounts={{ not_started: 50 }}
        variant='mini'
        workflowConfig={DEFAULT_WORKFLOW_STEPS}
      />
    );

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders mini variant with 100% when all chapters are complete', () => {
    renderWithProviders(
      <CardProgressBar
        chapterStatusCounts={{ complete: 50 }}
        variant='mini'
        workflowConfig={DEFAULT_WORKFLOW_STEPS}
      />
    );

    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
