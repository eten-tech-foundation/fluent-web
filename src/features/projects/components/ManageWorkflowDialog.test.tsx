import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageWorkflowDialog } from '@/features/projects/components/ManageWorkflowDialog';
import { type WorkflowStep } from '@/features/projects/hooks/useProjectWorkflow';
import { Logger } from '@/lib/services/logger';
import { ChapterAssignmentStatus, type ChapterAssignmentProgress } from '@/lib/types';
import { fireEvent, render, screen } from '@/test/render';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockAddStage = vi.fn();
const mockRenameStage = vi.fn();
const mockDeleteStage = vi.fn();
const mockReorderStages = vi.fn();
const mockUpdateWorkflowConfig = vi.fn();
let mockWorkflowConfig: WorkflowStep[] = [];
let mockIsUpdating = false;
let mockIsLoading = false;
let mockIsLoadedFromServer: boolean | undefined = undefined;

vi.mock('@/features/projects/hooks/useProjectWorkflow', () => ({
  DEFAULT_WORKFLOW_STEPS: [],
  useProjectWorkflow: () => ({
    workflowConfig: mockWorkflowConfig,
    addStage: mockAddStage,
    renameStage: mockRenameStage,
    deleteStage: mockDeleteStage,
    reorderStages: mockReorderStages,
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
    mockAddStage.mockResolvedValue({ stageId: 99, label: 'New Stage', id: 'custom_99' });
    mockRenameStage.mockResolvedValue({});
    mockDeleteStage.mockResolvedValue({});
    mockReorderStages.mockResolvedValue([]);
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
    expect(mockDeleteStage).toHaveBeenCalledWith(4);
    expect(screen.queryByText('Community Review')).not.toBeInTheDocument();
  });

  it('prevents deleting and dragging a stage if it is locked by the server', () => {
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
        isLocked: true,
      },
      { id: 'complete', label: 'Complete', stageId: 5, position: 4, isFixed: true },
    ];

    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    // Because community_review is locked by server (reached/passed progress), delete button and drag handle are hidden
    expect(screen.queryByRole('button', { name: /Delete stage/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Reorder stage Community Review/i })
    ).not.toBeInTheDocument();
  });

  it('allows renaming a stage and enforces validation rules (empty, length, duplicate)', async () => {
    const user = userEvent.setup();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    // Click on Community Review to edit
    const stageBtn = screen.getByRole('button', { name: 'Community Review' });
    await user.click(stageBtn);

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('Community Review');

    // 1. Empty validation
    await user.clear(input);
    expect(screen.getByText('Stage name cannot be empty.')).toBeInTheDocument();

    // 2. Length > 30 validation (trimmed)
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
    expect(mockRenameStage).toHaveBeenCalledWith({ stageId: 4, displayName: 'Field Review' });
  });

  it('cancels renaming when Escape key is pressed without closing dialog', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Community Review' }));
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Temporary Name{Escape}');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Community Review')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('adds a new stage, calls addStage, and enters edit mode once created', async () => {
    const user = userEvent.setup();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    const addBtn = screen.getByRole('button', { name: /Add Stage/i });
    await user.click(addBtn);

    expect(mockAddStage).toHaveBeenCalledWith('New Stage');
    expect(await screen.findByRole('textbox')).toHaveValue('New Stage');
  });

  it('does not allow renaming or deleting a stage while addStage is in flight', async () => {
    let resolveAdd: (val: { stageId: number; label: string; id: string }) => void;
    mockAddStage.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveAdd = resolve;
        })
    );

    const user = userEvent.setup();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    const addBtn = screen.getByRole('button', { name: /Add Stage/i });
    await user.click(addBtn);

    // Card should be rendered optimistically with pending disabled state
    const pendingButton = screen.getByRole('button', { name: 'New Stage' });
    expect(pendingButton).toBeDisabled();

    // Resolving addStage should assign stageId and open the edit textbox
    resolveAdd!({ stageId: 99, label: 'New Stage', id: 'custom_99' });
    expect(await screen.findByRole('textbox')).toHaveValue('New Stage');
  });

  it('disables Add Stage when a chapter has reached completion', () => {
    const completedAssignments: ChapterAssignmentProgress[] = [
      {
        bibleId: 1,
        bookId: 1,
        bookCode: 'GEN',
        sourceLangCode: 'eng',
        targetLangCode: 'eng',
        bookNameEng: 'Genesis',
        chapterNumber: 1,
        status: ChapterAssignmentStatus.COMPLETE,
        assignedUser: null,
        peerChecker: null,
        projectUnitId: 1,
        assignmentId: 1,
        totalVerses: 10,
        completedVerses: 10,
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

  it('disables Add Stage when Complete stage is locked by the server', () => {
    mockWorkflowConfig = [
      { id: 'not_started', label: 'Not Started', stageId: 1, position: 0, isFixed: true },
      { id: 'draft', label: 'Drafting', stageId: 2, position: 1, isFixed: true },
      { id: 'peer_check', label: 'Peer Check', stageId: 3, position: 2, isFixed: true },
      { id: 'complete', label: 'Complete', stageId: 4, position: 3, isFixed: true, isLocked: true },
    ];

    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={vi.fn()} />);

    const addBtn = screen.getByRole('button', { name: /Add Stage/i });
    expect(addBtn).toBeDisabled();
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

  it('closes dialog when Done is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ManageWorkflowDialog isOpen={true} projectId={1} onClose={onClose} />);

    const doneBtn = screen.getByRole('button', { name: /Done/i });
    await user.click(doneBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports drag-and-drop reordering between unlocked stages and calls reorderStages', () => {
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

    // Start dragging Custom Check
    fireEvent.dragStart(customGrip, { dataTransfer });

    // Dragging over locked stage (Drafting) should NOT reorder
    fireEvent.dragOver(draftEl, { dataTransfer });

    // Dragging over unlocked stage (Community Review) should reorder
    fireEvent.dragOver(commRevEl, { dataTransfer });
    fireEvent.dragEnd(customCheckEl);

    // After reorder, reorderStages should be called with the full order including bookends
    expect(mockReorderStages).toHaveBeenCalledWith([1, 2, 3, 5, 4, 6]);
  });

  it('does not call reorderStages when a stage is dropped back where it started', () => {
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

    const customCheckEl = screen.getByText('Custom Check').closest('.group-stage-card')!;
    const customGrip = customCheckEl.querySelector('[draggable="true"]')!;

    fireEvent.dragStart(customGrip, { dataTransfer });
    fireEvent.dragEnd(customCheckEl);

    expect(mockReorderStages).not.toHaveBeenCalled();
  });

  it('supports keyboard reordering using Arrow keys on grip handle', async () => {
    const user = userEvent.setup();
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

    const customGrip = screen.getByRole('button', { name: 'Reorder stage Custom Check' });
    customGrip.focus();
    await user.keyboard('{ArrowUp}');

    expect(mockReorderStages).toHaveBeenCalledWith([1, 2, 3, 5, 4, 6]);
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
