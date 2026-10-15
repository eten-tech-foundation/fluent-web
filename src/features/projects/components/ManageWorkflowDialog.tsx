import React, { useEffect, useRef, useState } from 'react';

import { GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useProjectWorkflow,
  type WorkflowStep,
} from '@/features/projects/hooks/useProjectWorkflow';
import { Logger } from '@/lib/services/logger';
import { ChapterAssignmentStatus, type ChapterAssignmentProgress } from '@/lib/types';
import { cn } from '@/lib/ui/utils';

interface ManageWorkflowDialogProps {
  projectId: number;
  isOpen: boolean;
  onClose: () => void;
  chapterAssignments?: ChapterAssignmentProgress[];
}

export const ManageWorkflowDialog: React.FC<ManageWorkflowDialogProps> = ({
  projectId,
  isOpen,
  onClose,
  chapterAssignments,
}) => {
  const { t } = useTranslation();
  const {
    workflowConfig,
    addStage,
    renameStage,
    deleteStage,
    reorderStages,
    isUpdating,
    isLoading,
    isLoadedFromServer,
  } = useProjectWorkflow(projectId);

  const [intermediateSteps, setIntermediateSteps] = useState<WorkflowStep[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const isReady = isLoadedFromServer;
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStartIndexRef = useRef<number | null>(null);

  const hasCompletedChapter =
    Boolean(
      chapterAssignments?.some(assignment => assignment.status === ChapterAssignmentStatus.COMPLETE)
    ) || workflowConfig.find(s => s.id === ChapterAssignmentStatus.COMPLETE)?.isLocked === true;

  useEffect(() => {
    if (!isOpen) {
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
      setDraggedIndex(null);
      return;
    }

    if (isReady && workflowConfig.length > 0) {
      const middle = workflowConfig.filter(
        step =>
          step.id !== ChapterAssignmentStatus.NOT_STARTED &&
          step.id !== ChapterAssignmentStatus.COMPLETE
      );
      setIntermediateSteps(middle);
    }
  }, [isOpen, workflowConfig, isReady]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Position lock is driven by server: fixed stages, stages that have reached/passed progress, or pending stages
  const isPositionLocked = (step: WorkflowStep) =>
    Boolean(step.isFixed || step.isLocked || !step.stageId);

  // Free stages can only be deleted if not fixed, not locked, and already created on the server
  const canDeleteStage = (step: WorkflowStep) =>
    !step.isFixed && !step.isLocked && Boolean(step.stageId);

  const handleDeleteStage = async (step: WorkflowStep) => {
    if (!step.stageId) return;
    if (editingId === step.id) {
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
    }
    // Optimistically update intermediateSteps
    setIntermediateSteps(prev => prev.filter(s => s.id !== step.id));
    try {
      await deleteStage(step.stageId);
    } catch (err) {
      Logger.logException(err, { context: 'Failed to delete workflow stage' });
      const message =
        err instanceof Error
          ? err.message
          : t('manageWorkflow.deleteFailed', 'Failed to delete stage.');
      toast.error(message);
      // Revert to workflowConfig on failure
      const middle = workflowConfig.filter(
        s =>
          s.id !== ChapterAssignmentStatus.NOT_STARTED && s.id !== ChapterAssignmentStatus.COMPLETE
      );
      setIntermediateSteps(middle);
    }
  };

  const validateStageName = (name: string, currentId: string): string => {
    const trimmed = name.trim();
    if (!trimmed) {
      return t('manageWorkflow.emptyName', 'Stage name cannot be empty.');
    }
    if (trimmed.length > 30) {
      return t('manageWorkflow.nameTooLong', 'Stage names are limited to 30 characters.');
    }

    const notStartedLabel =
      workflowConfig.find(s => s.id === ChapterAssignmentStatus.NOT_STARTED)?.label ??
      t('manageWorkflow.notStarted', 'Not Started');
    const completeLabel =
      workflowConfig.find(s => s.id === ChapterAssignmentStatus.COMPLETE)?.label ??
      t('manageWorkflow.complete', 'Complete');

    const allOtherNames = [
      notStartedLabel,
      completeLabel,
      ...intermediateSteps.filter(s => s.id !== currentId).map(s => s.label),
    ];

    if (allOtherNames.some(other => other.toLowerCase() === trimmed.toLowerCase())) {
      return t('manageWorkflow.nameMustBeUnique', 'Stage name must be unique.');
    }

    return '';
  };

  const handleStartEdit = (step: WorkflowStep) => {
    if (!step.stageId) return;
    setEditingId(step.id);
    setEditingValue(step.label);
    setErrorMessage('');
  };

  const handleInputChange = (val: string, currentId: string) => {
    setEditingValue(val);
    const err = validateStageName(val, currentId);
    setErrorMessage(err);
  };

  const handleCommitEdit = async (step: WorkflowStep) => {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      // Revert if empty
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
      return;
    }

    const err = validateStageName(editingValue, step.id);
    if (err) {
      setErrorMessage(err);
      return;
    }

    if (trimmed === step.label) {
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
      return;
    }

    // Optimistically update intermediateSteps
    setIntermediateSteps(prev => prev.map(s => (s.id === step.id ? { ...s, label: trimmed } : s)));
    setEditingId(null);
    setEditingValue('');
    setErrorMessage('');

    if (step.stageId) {
      try {
        await renameStage({ stageId: step.stageId, displayName: trimmed });
      } catch (apiErr) {
        Logger.logException(apiErr, { context: 'Failed to rename workflow stage' });
        const message =
          apiErr instanceof Error
            ? apiErr.message
            : t('manageWorkflow.renameFailed', 'Failed to rename stage.');
        toast.error(message);
        // Revert to workflowConfig on failure
        const middle = workflowConfig.filter(
          s =>
            s.id !== ChapterAssignmentStatus.NOT_STARTED &&
            s.id !== ChapterAssignmentStatus.COMPLETE
        );
        setIntermediateSteps(middle);
      }
    }
  };

  const handleBlur = (step: WorkflowStep) => {
    if (editingId !== step.id) return;
    const err = validateStageName(editingValue, step.id);
    if (err) {
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
    } else {
      void handleCommitEdit(step);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, step: WorkflowStep) => {
    if (e.key === 'Enter') {
      const err = validateStageName(editingValue, step.id);
      if (!err) {
        void handleCommitEdit(step);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
    }
  };

  const generateUniqueName = (base: string) => {
    let name = base;
    let counter = 1;
    const notStartedLabel =
      workflowConfig.find(s => s.id === ChapterAssignmentStatus.NOT_STARTED)?.label ??
      t('manageWorkflow.notStarted', 'Not Started');
    const completeLabel =
      workflowConfig.find(s => s.id === ChapterAssignmentStatus.COMPLETE)?.label ??
      t('manageWorkflow.complete', 'Complete');
    const allNames = [
      notStartedLabel,
      completeLabel,
      ...intermediateSteps.map(s => s.label.toLowerCase()),
    ];

    while (allNames.some(n => n.toLowerCase() === name.toLowerCase())) {
      counter++;
      name = `${base} ${counter}`;
    }
    return name;
  };

  const handleAddStage = async () => {
    if (intermediateSteps.length >= 10 || hasCompletedChapter) return;

    const newName = generateUniqueName('New Stage');
    const tempId = `custom_${Date.now()}`;
    const newStep: WorkflowStep = {
      id: tempId,
      label: newName,
      roleName: newName,
      enabled: true,
    };

    setIntermediateSteps(prev => [...prev, newStep]);
    setEditingId(null);
    setEditingValue('');
    setErrorMessage('');

    try {
      const created = await addStage(newName);
      if (created.stageId) {
        const createdId = created.id ?? String(created.stageId);
        setIntermediateSteps(prev =>
          prev.map(s => (s.id === tempId ? { ...s, stageId: created.stageId, id: createdId } : s))
        );
        setEditingId(createdId);
        setEditingValue(newName);
      }
    } catch (err) {
      Logger.logException(err, { context: 'Failed to add workflow stage' });
      const message =
        err instanceof Error ? err.message : t('manageWorkflow.addFailed', 'Failed to add stage.');
      toast.error(message);
      setIntermediateSteps(prev => prev.filter(s => s.id !== tempId));
      setEditingId(null);
      setEditingValue('');
    }
  };

  const applyReorder = async (updated: WorkflowStep[]) => {
    setIntermediateSteps(updated);
    const middleIds = updated
      .map(s => s.stageId)
      .filter((id): id is number => typeof id === 'number');

    const notStartedStage = workflowConfig.find(s => s.id === ChapterAssignmentStatus.NOT_STARTED);
    const completeStage = workflowConfig.find(s => s.id === ChapterAssignmentStatus.COMPLETE);

    const stageIds: number[] = [];
    if (typeof notStartedStage?.stageId === 'number') {
      stageIds.push(notStartedStage.stageId);
    }
    stageIds.push(...middleIds);
    if (typeof completeStage?.stageId === 'number') {
      stageIds.push(completeStage.stageId);
    }

    if (stageIds.length > 0) {
      try {
        await reorderStages(stageIds);
      } catch (err) {
        Logger.logException(err, { context: 'Failed to reorder workflow stages' });
        const message =
          err instanceof Error
            ? err.message
            : t('manageWorkflow.reorderFailed', 'Failed to reorder stages.');
        toast.error(message);
        const middle = workflowConfig.filter(
          s =>
            s.id !== ChapterAssignmentStatus.NOT_STARTED &&
            s.id !== ChapterAssignmentStatus.COMPLETE
        );
        setIntermediateSteps(middle);
      }
    }
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= intermediateSteps.length) return;
    if (
      isPositionLocked(intermediateSteps[index]) ||
      isPositionLocked(intermediateSteps[targetIndex])
    )
      return;

    const updated = [...intermediateSteps];
    const [draggedItem] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, draggedItem);
    void applyReorder(updated);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isPositionLocked(intermediateSteps[index])) {
      e.preventDefault();
      return;
    }
    dragStartIndexRef.current = index;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    const cardEl =
      (e.currentTarget as HTMLElement).closest('.group-stage-card') ??
      (e.currentTarget as HTMLElement).parentElement?.parentElement;
    if (cardEl) {
      e.dataTransfer.setDragImage(cardEl, 20, 20);
    }
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    if (isPositionLocked(intermediateSteps[targetIndex])) return;

    const updated = [...intermediateSteps];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, draggedItem);
    setIntermediateSteps(updated);
    setDraggedIndex(targetIndex);
  };

  const handleDragEnd = () => {
    const startIndex = dragStartIndexRef.current;
    dragStartIndexRef.current = null;
    const finalIndex = draggedIndex;
    setDraggedIndex(null);
    if (startIndex !== null && finalIndex !== null && startIndex !== finalIndex) {
      void applyReorder(intermediateSteps);
    }
  };

  const handleDone = () => {
    if (editingId) {
      const step = intermediateSteps.find(s => s.id === editingId);
      if (step) {
        handleBlur(step);
      }
    }
    onClose();
  };

  const canAddStage = intermediateSteps.length < 10 && !hasCompletedChapter;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className='sm:max-w-[480px]'
        onEscapeKeyDown={e => {
          if (editingId) {
            e.preventDefault();
            setEditingId(null);
            setEditingValue('');
            setErrorMessage('');
          }
        }}
      >
        <DialogHeader className='flex flex-row items-center justify-between pb-2'>
          <DialogTitle className='text-xl font-bold'>
            {t('manageWorkflow.title', 'Manage Workflow')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className='flex h-48 items-center justify-center gap-2'>
            <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
            <span className='text-muted-foreground text-sm font-medium'>
              {t('manageWorkflow.loadingWorkflow', 'Loading workflow...')}
            </span>
          </div>
        ) : !isReady ? (
          <div className='flex h-48 flex-col items-center justify-center gap-2 text-center'>
            <p className='text-destructive text-sm font-semibold'>
              {t(
                'manageWorkflow.unableToLoad',
                'Unable to load workflow configuration from server.'
              )}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t(
                'manageWorkflow.editingDisabled',
                'Editing is disabled to prevent duplicate or conflicting stages.'
              )}
            </p>
          </div>
        ) : (
          <div className='max-h-[60vh] space-y-3 overflow-y-auto py-2 pr-1'>
            {/* Fixed Top Bookend Card: Not Started */}
            <div className='border-border bg-muted/60 text-muted-foreground w-full rounded-md border px-4 py-3.5 text-center text-sm font-bold shadow-2xs select-none'>
              {workflowConfig.find(s => s.id === ChapterAssignmentStatus.NOT_STARTED)?.label ??
                t('manageWorkflow.notStarted', 'Not Started')}
            </div>

            {/* Intermediate Configured Stages */}
            {intermediateSteps.map((step, index) => {
              const posLocked = isPositionLocked(step);
              const deletable = canDeleteStage(step);
              const isEditing = editingId === step.id;
              const isBeingDragged = draggedIndex === index;

              return (
                <div
                  key={step.id}
                  className={`group-stage-card border-border bg-card text-card-foreground flex w-full items-center justify-between rounded-md border px-4 py-3.5 text-sm font-bold shadow-2xs transition-all ${
                    isBeingDragged
                      ? 'border-primary opacity-40'
                      : 'hover:border-accent-foreground/20'
                  }`}
                  onDragEnd={handleDragEnd}
                  onDragOver={e => handleDragOver(e, index)}
                >
                  <div className='mr-2 flex w-full items-center gap-3'>
                    {!posLocked && (
                      <div
                        draggable
                        aria-label={`Reorder stage ${step.label}`}
                        className='text-muted-foreground hover:text-foreground focus-visible:ring-ring flex shrink-0 cursor-grab items-center rounded-xs transition-colors focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing'
                        role='button'
                        tabIndex={0}
                        onDragStart={e => handleDragStart(e, index)}
                        onKeyDown={e => {
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            moveStep(index, 'up');
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            moveStep(index, 'down');
                          }
                        }}
                      >
                        <GripVertical className='h-4 w-4' />
                      </div>
                    )}

                    {isEditing ? (
                      <div className='w-full'>
                        <input
                          ref={inputRef}
                          className='border-primary bg-background text-foreground w-full rounded-md border px-2.5 py-1 text-sm font-bold shadow-xs outline-none'
                          value={editingValue}
                          onBlur={() => handleBlur(step)}
                          onChange={e => handleInputChange(e.target.value, step.id)}
                          onKeyDown={e => handleKeyDown(e, step)}
                        />
                        {errorMessage && (
                          <p className='text-destructive mt-1 text-left text-xs font-semibold'>
                            {errorMessage}
                          </p>
                        )}
                      </div>
                    ) : (
                      <button
                        className={cn(
                          'focus-visible:ring-ring rounded-xs text-left font-bold transition-colors focus-visible:ring-2 focus-visible:outline-none',
                          step.stageId
                            ? 'hover:text-primary cursor-pointer'
                            : 'cursor-default opacity-70'
                        )}
                        disabled={!step.stageId}
                        title={
                          step.stageId
                            ? t('manageWorkflow.clickToRename', 'Click to rename stage')
                            : undefined
                        }
                        type='button'
                        onClick={() => handleStartEdit(step)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleStartEdit(step);
                          }
                        }}
                      >
                        {step.label}
                      </button>
                    )}
                  </div>

                  {deletable && (
                    <button
                      className='text-muted-foreground hover:text-destructive shrink-0 rounded-md p-1 transition-colors'
                      title={t('manageWorkflow.deleteStage', 'Delete stage')}
                      type='button'
                      onClick={() => void handleDeleteStage(step)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </button>
                  )}
                </div>
              );
            })}

            {/* + Add Stage Button Card */}
            {canAddStage ? (
              <button
                className='border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-3.5 text-center text-sm font-bold transition-colors'
                type='button'
                onClick={() => void handleAddStage()}
              >
                <Plus className='h-4 w-4' /> {t('manageWorkflow.addStage', 'Add Stage')}
              </button>
            ) : (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className='w-full'>
                      <button
                        disabled
                        className='border-border bg-muted/30 text-muted-foreground flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-3.5 text-center text-sm font-bold opacity-60'
                        type='button'
                      >
                        <Plus className='h-4 w-4' /> {t('manageWorkflow.addStage', 'Add Stage')}
                      </button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    align='center'
                    className='bg-popover text-popover-foreground border-border rounded-md border px-3 py-1.5 text-xs font-semibold shadow-md'
                    side='top'
                  >
                    {hasCompletedChapter
                      ? t(
                          'manageWorkflow.cannotAddCompleted',
                          'Cannot add stages once chapters have reached completion.'
                        )
                      : t('manageWorkflow.stageLimitReached', 'You already have 10 stages.')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Fixed Bottom Bookend Card: Complete */}
            <div className='border-border bg-muted/60 text-muted-foreground w-full rounded-md border px-4 py-3.5 text-center text-sm font-bold shadow-2xs select-none'>
              {workflowConfig.find(s => s.id === ChapterAssignmentStatus.COMPLETE)?.label ??
                t('manageWorkflow.complete', 'Complete')}
            </div>
          </div>
        )}

        {/* Footer Done Action */}
        <div className='flex justify-end pt-4'>
          <Button disabled={isUpdating || isLoading || !isReady} onClick={handleDone}>
            {isUpdating ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
            {t('manageWorkflow.done', 'Done')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
