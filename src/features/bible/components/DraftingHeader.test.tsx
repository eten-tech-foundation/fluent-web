import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DraftingHeader } from '@/features/bible/components/DraftingHeader';
import { ChapterAssignmentStatus, type ProjectItem } from '@/lib/types';

const mockProjectItem: ProjectItem = {
  chapterAssignmentId: 1,
  projectId: 100,
  projectName: 'Test Project',
  projectUnitId: 10,
  bibleId: 1,
  bibleName: 'WEB',
  targetLanguage: 'English',
  targetLangCode: 'eng',
  bookId: 1,
  book: 'Genesis',
  chapterStatus: ChapterAssignmentStatus.DRAFT,
  chapterNumber: 1,
  totalVerses: 10,
  completedVerses: 0,
  submittedTime: null,
  bookCode: 'GEN',
  sourceLangCode: 'eng',
};

const defaultProps = {
  projectItem: mockProjectItem,
  readOnly: false,
  showResources: false,
  isAnythingSaving: false,
  hasAnyError: false,
  progressPercentage: 50,
  isTranslationComplete: false,
  isComplete: false,
  isDraft: true,
  buttonText: 'Submit Chapter',
  onBack: vi.fn(),
  onToggleResources: vi.fn(),
  onSubmit: vi.fn(),
};

describe('DraftingHeader', () => {
  it('renders View Resources button in outline variant with primary blue outline and icon when showResources is false', () => {
    render(<DraftingHeader {...defaultProps} showResources={false} />);

    const toggleButton = screen.getByRole('button', { pressed: false });
    expect(toggleButton).toBeInTheDocument();
    // Verify outline variant and primary blue styling
    expect(toggleButton).toHaveClass('border-primary');
    expect(toggleButton).toHaveClass('text-primary');
    expect(toggleButton).not.toHaveClass('bg-primary');
  });

  it('renders View Resources button in default variant when showResources is true', () => {
    render(<DraftingHeader {...defaultProps} showResources={true} />);

    const toggleButton = screen.getByRole('button', { pressed: true });
    expect(toggleButton).toBeInTheDocument();
    // Verify default variant classes from buttonVariants
    expect(toggleButton).toHaveClass('bg-primary');
  });

  it('triggers onToggleResources when View Resources button is clicked', async () => {
    const user = userEvent.setup();
    const onToggleResources = vi.fn();
    render(<DraftingHeader {...defaultProps} onToggleResources={onToggleResources} />);

    const toggleButton = screen.getByRole('button', { pressed: false });
    await user.click(toggleButton);

    expect(onToggleResources).toHaveBeenCalledOnce();
  });
});
