import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageWorkflowDialog } from '@/features/projects/components/ManageWorkflowDialog';
import { type WorkflowStep } from '@/features/projects/hooks/useProjectWorkflow';
import { Logger } from '@/lib/services/logger';
import { ChapterAssignmentStatus, type ChapterAssignmentProgress } from '@/lib/types';
import { fireEvent, render, screen, waitFor } from '@/test/render';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockUpdateWorkflowConfig = vi.fn();
let mockWorkflowConfig: WorkflowStep[] = [];
let mockIsUpdating = false;
let mockIsLoading = false;
let mockIsLoadedFromServer: boolean | undefined = undefined;

vi.mock('@/features/projects/hooks/useProjectWorkflow', () => ({
  DEFAULT_WORKFLOW_STEPS: [],
  useProjectWorkflow: () => ({
    workflowConfig: mockWorkflowConfig,
    updateWorkflowConfig: mockUpdateWorkflowConfig,
    isUpdating: mockIsUpdating,
    isLoading: mockIsLoading,
    isLoadedFromServer: mockIsLoadedFromServer ?? true,
  }),
}));

const defaultTestSteps: WorkflowStep[] = [
  { id: 'not_started', label: 'Not Started', stageId: 1, position: 0, isFixed: true },
  { id: 'draft', label: 'Drafting', stageId: 2, position: 1, isFixed: true },
  { id: 'peer_check', label: 'Peer Check', stageId: 3, position: 2, isFixed: true },
  { id: 'community_review', label: 'Community Review', stageId: 4, position: 3, isFixed: false },
  { id: 'complete', label: 'Complete', stageId: 5, position: 4, isFixed: true },
];

describe('ManageWorkflowDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowConfig = [...defaultTestSteps];
    mockIsUpdating = false;
    mockIsLoading = false;
    mockIsLoadedFromServer = undefined;
    mockUpdateWorkflowConfig.mockResolvedValue(undefined);
    vi.spyOn(Logger, 'logException').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders fixed bookends and intermediate stages when open', () => {
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    expect(screen.getByText('Manage Workflow')).toBeInTheDocument();
    expect(screen.getByText('Not Started')).toBeInTheDocument();
    expect(screen.getByText('Drafting')).toBeInTheDocument();
    expect(screen.getByText('Peer Check')).toBeInTheDocument();
    expect(screen.getByText('Community Review')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Stage/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();
  });

  it('does not allow deleting fixed stages, but allows deleting free intermediate stages', async () => {
    const user = userEvent.setup();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    // Only Community Review should have a delete button
    const deleteButtons = screen.getAllByRole('button', { name: /Delete stage/i });
    expect(deleteButtons).toHaveLength(1);

    await user.click(deleteButtons[0]);
    expect(screen.queryByText('Community Review')).not.toBeInTheDocument();
  });

  it('prevents deleting a stage if content has reached or passed it', () => {
    const chapterAssignmentsWithProgress: ChapterAssignmentProgress[] = [
      {
        assignmentId: 1,
        projectUnitId: 1,
        status: 'community_review',
        bookNameEng: 'Genesis',
        chapterNumber: 1,
        bibleId: 1,
        bookId: 1,
        bookCode: 'GEN',
        sourceLangCode: 'eng',
        targetLangCode: 'fra',
        assignedUser: null,
        peerChecker: null,
        totalVerses: 10,
        completedVerses: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        submittedTime: null,
      },
    ];

    render(
      <ManageWorkflowDialog
        chapterAssignments={chapterAssignmentsWithProgress}
        isOpen={true}
        projectId={1}
        onClose={vi.fn()}
      />
    );

    // Because chapter has reached community_review, delete button is hidden
    expect(screen.queryByRole('button', { name: /Delete stage/i })).not.toBeInTheDocument();
  });

  it('allows renaming a stage and enforces validation rules (empty, length, duplicate)', async () => {
    const user = userEvent.setup();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    // Click on Community Review to edit
    const stageSpan = screen.getByText('Community Review');
    await user.click(stageSpan);

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Community Review');

    // 1. Empty validation
    await user.clear(input);
    expect(screen.getByText('Stage name cannot be empty.')).toBeInTheDocument();

    // 2. Length > 30 validation
    await user.type(input, 'This is a stage name that is far too long to be allowed');
    expect(screen.getByText('Stage names are limited to 30 characters.')).toBeInTheDocument();

    // 3. Duplicate validation
    await user.clear(input);
    await user.type(input, 'Drafting');
    expect(screen.getByText('Stage name must be unique.')).toBeInTheDocument();

    // 4. Valid rename with Enter key
    await user.clear(input);
    await user.type(input, 'Field Review{Enter}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Field Review')).toBeInTheDocument();
  });

  it('cancels renaming when Escape key is pressed', async () => {
    const user = userEvent.setup();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    await user.click(screen.getByText('Community Review'));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Temporary Name{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Community Review')).toBeInTheDocument();
  });

  it('adds a new stage and enters edit mode', async () => {
    const user = userEvent.setup();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    const addBtn = screen.getByRole('button', { name: /Add Stage/i });
    await user.click(addBtn);

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('New Stage');
    await user.clear(input);
    await user.type(input, 'Quality Check{Enter}');

    expect(screen.getByText('Quality Check')).toBeInTheDocument();
  });

  it('disables Add Stage when 10 intermediate stages exist', () => {
    const tenIntermediateSteps: WorkflowStep[] = [
      { id: 'not_started', label: 'Not Started', stageId: 1, position: 0, isFixed: true },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `stage_${i + 1}`,
        label: `Stage ${i + 1}`,
        stageId: i + 2,
        position: i + 1,
        isFixed: false,
      })),
      { id: 'complete', label: 'Complete', stageId: 12, position: 11, isFixed: true },
    ];
    mockWorkflowConfig = tenIntermediateSteps;

    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    const addBtn = screen.getByRole('button', { name: /Add Stage/i });
    expect(addBtn).toBeDisabled();
  });

  it('disables Add Stage when a chapter has reached completion', () => {
    const completedAssignments: ChapterAssignmentProgress[] = [
      {
        assignmentId: 1,
        projectUnitId: 1,
        status: ChapterAssignmentStatus.COMPLETE,
        bookNameEng: 'Genesis',
        chapterNumber: 1,
        bibleId: 1,
        bookId: 1,
        bookCode: 'GEN',
        sourceLangCode: 'eng',
        targetLangCode: 'fra',
        assignedUser: null,
        peerChecker: null,
        totalVerses: 10,
        completedVerses: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
        submittedTime: null,
      },
    ];

    render(
      <ManageWorkflowDialog
        chapterAssignments={completedAssignments}
        isOpen={true}
        projectId={1}
        onClose={vi.fn()}
      />
    );

    const addBtn = screen.getByRole('button', { name: /Add Stage/i });
    expect(addBtn).toBeDisabled();
  });

  it('saves workflow configuration and closes dialog on success', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={onClose} />);

    const doneBtn = screen.getByRole('button', { name: /Done/i });
    await user.click(doneBtn);

    expect(mockUpdateWorkflowConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateWorkflowConfig).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'not_started', label: 'Not Started' }),
      expect.objectContaining({ id: 'draft', label: 'Drafting' }),
      expect.objectContaining({ id: 'peer_check', label: 'Peer Check' }),
      expect.objectContaining({ id: 'community_review', label: 'Community Review' }),
      expect.objectContaining({ id: 'complete', label: 'Complete' }),
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays error toast and keeps dialog open when saving fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockUpdateWorkflowConfig.mockRejectedValueOnce(
      new Error('Failed to update: Maximum stages reached')
    );

    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={onClose} />);

    const doneBtn = screen.getByRole('button', { name: /Done/i });
    await user.click(doneBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update: Maximum stages reached');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('preserves user edits across background query refetches while open', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />
    );

    // Delete Community Review
    const deleteBtn = screen.getByRole('button', { name: /Delete stage/i });
    await user.click(deleteBtn);
    expect(screen.queryByText('Community Review')).not.toBeInTheDocument();

    // Simulate background refetch updating mockWorkflowConfig
    mockWorkflowConfig = [
      ...defaultTestSteps,
      { id: 'new_refetched', label: 'Refetched Stage', stageId: 9 },
    ];
    rerender(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    // User's deleted state should STILL be preserved (Community Review is not restored)
    expect(screen.queryByText('Community Review')).not.toBeInTheDocument();
    expect(screen.queryByText('Refetched Stage')).not.toBeInTheDocument();
  });

  it('supports drag-and-drop reordering between unlocked stages and prevents reordering locked stages', () => {
    mockWorkflowConfig = [
      { id: 'not_started', label: 'Not Started', stageId: 1, position: 0, isFixed: true },
      { id: 'draft', label: 'Drafting', stageId: 2, position: 1, isFixed: true },
      { id: 'peer_check', label: 'Peer Check', stageId: 3, position: 2, isFixed: true },
      {
        id: 'community_review',
        label: 'Community Review',
        stageId: 4,
        position: 3,
        isFixed: false,
      },
      { id: 'custom_check', label: 'Custom Check', stageId: 5, position: 4, isFixed: false },
      { id: 'complete', label: 'Complete', stageId: 6, position: 5, isFixed: true },
    ];

    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    const dataTransfer = {
      effectAllowed: 'none',
      setDragImage: vi.fn(),
      setData: vi.fn(),
      getData: vi.fn(),
    };

    const commRevEl = screen.getByText('Community Review').closest('.group-stage-card')!;
    const customCheckEl = screen.getByText('Custom Check').closest('.group-stage-card')!;
    const draftEl = screen.getByText('Drafting').closest('.group-stage-card')!;

    const customGrip = customCheckEl.querySelector('[draggable="true"]')!;
    expect(customGrip).toBeInTheDocument();

    // Start dragging Custom Check (index 4 in intermediateSteps: [Draft, PeerCheck, CommRev, CustomCheck])
    fireEvent.dragStart(customGrip, { dataTransfer });

    // Dragging over locked stage (Drafting) should NOT reorder
    fireEvent.dragOver(draftEl, { dataTransfer });

    // Dragging over unlocked stage (Community Review) should reorder
    fireEvent.dragOver(commRevEl, { dataTransfer });
    fireEvent.dragEnd(customCheckEl);

    // After reorder, Custom Check should appear before Community Review
    const stageTitles = screen
      .getAllByText(/(Drafting|Peer Check|Community Review|Custom Check)/)
      .map(el => el.textContent);
    expect(stageTitles).toEqual(['Drafting', 'Peer Check', 'Custom Check', 'Community Review']);
  });

  it('displays loading indicator while workflow is loading', () => {
    mockIsLoading = true;
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    expect(screen.getByText('Loading workflow...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Done/i })).toBeDisabled();
  });

  it('displays error state and disables Done button when workflow failed to load from server', () => {
    mockIsLoadedFromServer = false;
    mockWorkflowConfig = [];
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    expect(
      screen.getByText('Unable to load workflow configuration from server.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Done/i })).toBeDisabled();
  });
});
