import React, { useEffect, useRef, useState } from 'react';

import { GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useProjectWorkflow,
  type WorkflowStep,
} from '@/features/projects/hooks/useProjectWorkflow';
import { Logger } from '@/lib/services/logger';
import { ChapterAssignmentStatus, type ChapterAssignmentProgress } from '@/lib/types';

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
  const { workflowConfig, updateWorkflowConfig, isUpdating } = useProjectWorkflow(projectId);
  const [intermediateSteps, setIntermediateSteps] = useState<WorkflowStep[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const middle = workflowConfig.filter(
        step => step.id !== 'not_started' && step.id !== 'complete'
      );
      setIntermediateSteps(JSON.parse(JSON.stringify(middle)));
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
      setDraggedIndex(null);
    }
  }, [isOpen, workflowConfig]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Position is locked for fixed-position stages (Drafting, Peer Check) or stages with active progress
  const isPositionLocked = (step: WorkflowStep) => {
    const isFixedPositionStage = ['draft', 'drafting', 'peer_check'].includes(step.id);
    if (isFixedPositionStage) return true;

    if (!chapterAssignments || chapterAssignments.length === 0) return false;

    const stageIdsInOrder = workflowConfig.map(s => s.id);
    const stepIndex = stageIdsInOrder.indexOf(step.id);

    return chapterAssignments.some(ca => {
      if (ca.status === step.id) return true;
      const currentStatusIndex = stageIdsInOrder.indexOf(ca.status);
      return currentStatusIndex > stepIndex && currentStatusIndex !== -1 && stepIndex !== -1;
    });
  };

  // Fixed stages (Not Started, Drafting, Peer Check, Complete) can never be deleted.
  // Free stages can only be deleted if no content has reached or passed them.
  const canDeleteStage = (step: WorkflowStep) => {
    if (['not_started', 'complete', 'draft', 'drafting', 'peer_check'].includes(step.id))
      return false;

    if (!chapterAssignments || chapterAssignments.length === 0) return true;

    const stageIdsInOrder = workflowConfig.map(s => s.id);
    const stepIndex = stageIdsInOrder.indexOf(step.id);

    // Cannot delete if any chapter has reached or passed this stage
    const hasContentReachedOrPassed = chapterAssignments.some(ca => {
      if (ca.status === step.id) return true;
      const currentStatusIndex = stageIdsInOrder.indexOf(ca.status);
      return currentStatusIndex > stepIndex && currentStatusIndex !== -1 && stepIndex !== -1;
    });

    return !hasContentReachedOrPassed;
  };

  const handleDeleteStage = (id: string) => {
    setIntermediateSteps(prev => prev.filter(step => step.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
    }
  };

  const validateStageName = (name: string, currentId: string): string => {
    const trimmed = name.trim();
    if (!trimmed) {
      return 'Stage name cannot be empty.';
    }
    if (name.length > 30) {
      return 'Stage names are limited to 30 characters.';
    }

    const notStartedLabel =
      workflowConfig.find(s => s.id === 'not_started')?.label ?? 'Not Started';
    const completeLabel = workflowConfig.find(s => s.id === 'complete')?.label ?? 'Complete';

    const allOtherNames = [
      notStartedLabel,
      completeLabel,
      ...intermediateSteps.filter(s => s.id !== currentId).map(s => s.label),
    ];

    if (allOtherNames.some(other => other.toLowerCase() === trimmed.toLowerCase())) {
      return 'Stage name must be unique.';
    }

    return '';
  };

  const handleStartEdit = (step: WorkflowStep) => {
    setEditingId(step.id);
    setEditingValue(step.label);
    setErrorMessage('');
  };

  const handleInputChange = (val: string, currentId: string) => {
    setEditingValue(val);
    const err = validateStageName(val, currentId);
    setErrorMessage(err);
  };

  const handleBlur = (currentId: string) => {
    if (editingId !== currentId) return;

    const err = validateStageName(editingValue, currentId);
    if (err) {
      // Revert to previous valid label on blur if invalid
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
    } else {
      // Save valid label
      setIntermediateSteps(prev =>
        prev.map(s => (s.id === currentId ? { ...s, label: editingValue.trim() } : s))
      );
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, currentId: string) => {
    if (e.key === 'Enter') {
      const err = validateStageName(editingValue, currentId);
      if (!err) {
        setIntermediateSteps(prev =>
          prev.map(s => (s.id === currentId ? { ...s, label: editingValue.trim() } : s))
        );
        setEditingId(null);
        setEditingValue('');
        setErrorMessage('');
      }
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingValue('');
      setErrorMessage('');
    }
  };

  const generateUniqueName = (base: string) => {
    let name = base;
    let counter = 1;
    const notStartedLabel =
      workflowConfig.find(s => s.id === 'not_started')?.label ?? 'Not Started';
    const completeLabel = workflowConfig.find(s => s.id === 'complete')?.label ?? 'Complete';
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

  const handleAddStage = () => {
    if (intermediateSteps.length >= 10) return;

    const newId = `custom_${Date.now()}`;
    const newName = generateUniqueName('New Stage');
    const newStep: WorkflowStep = {
      id: newId,
      label: newName,
      roleName: newName,
      enabled: true,
    };

    setIntermediateSteps(prev => [...prev, newStep]);
    setEditingId(newId);
    setEditingValue(newName);
    setErrorMessage('');
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isPositionLocked(intermediateSteps[index])) {
      e.preventDefault();
      return;
    }
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
    setDraggedIndex(null);
  };

  const handleSave = async () => {
    const notStartedStep = workflowConfig.find(s => s.id === 'not_started') ?? {
      id: 'not_started',
      label: 'Not Started',
      enabled: true,
    };
    const completeStep = workflowConfig.find(s => s.id === 'complete') ?? {
      id: 'complete',
      label: 'Complete',
      enabled: true,
    };

    const finalSteps: WorkflowStep[] = [notStartedStep, ...intermediateSteps, completeStep];

    try {
      await updateWorkflowConfig(finalSteps);
      onClose();
    } catch (err) {
      Logger.logException(err, { context: 'Failed to save workflow configuration' });
    }
  };

  const hasCompletedChapter = Boolean(
    chapterAssignments?.some(
      ca => ca.status === 'complete' || ca.status === ChapterAssignmentStatus.COMPLETE
    )
  );

  const canAddStage = intermediateSteps.length < 10 && !hasCompletedChapter;

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className='sm:max-w-[480px]'>
        <DialogHeader className='flex flex-row items-center justify-between pb-2'>
          <DialogTitle className='text-xl font-bold'>Manage Workflow</DialogTitle>
        </DialogHeader>

        <div className='max-h-[60vh] space-y-3 overflow-y-auto py-2 pr-1'>
          {/* Fixed Top Bookend Card: Not Started */}
          <div className='border-border bg-muted/60 text-muted-foreground w-full rounded-md border px-4 py-3.5 text-center text-sm font-bold shadow-2xs select-none'>
            {workflowConfig.find(s => s.id === 'not_started')?.label ?? 'Not Started'}
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
                  isBeingDragged ? 'border-primary opacity-40' : 'hover:border-accent-foreground/20'
                }`}
                onDragEnd={handleDragEnd}
                onDragOver={e => handleDragOver(e, index)}
              >
                <div className='mr-2 flex w-full items-center gap-3'>
                  {!posLocked && (
                    <div
                      draggable
                      className='text-muted-foreground hover:text-foreground flex shrink-0 cursor-grab items-center transition-colors active:cursor-grabbing'
                      onDragStart={e => handleDragStart(e, index)}
                    >
                      <GripVertical className='h-4 w-4' />
                    </div>
                  )}

                  {isEditing ? (
                    <div className='w-full'>
                      <Input
                        ref={inputRef}
                        className='border-primary bg-background text-foreground w-full rounded-md border px-2.5 py-1 text-sm font-bold shadow-xs outline-none'
                        value={editingValue}
                        onBlur={() => handleBlur(step.id)}
                        onChange={e => handleInputChange(e.target.value, step.id)}
                        onKeyDown={e => handleKeyDown(e, step.id)}
                      />
                      {errorMessage && (
                        <p className='text-destructive mt-1 text-left text-xs font-semibold'>
                          {errorMessage}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span
                      className='hover:text-primary cursor-pointer text-left font-bold transition-colors'
                      title='Click to rename stage'
                      onClick={() => handleStartEdit(step)}
                    >
                      {step.label}
                    </span>
                  )}
                </div>

                {deletable && (
                  <button
                    className='text-muted-foreground hover:text-destructive shrink-0 rounded-md p-1 transition-colors'
                    title='Delete stage'
                    type='button'
                    onClick={() => handleDeleteStage(step.id)}
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
              onClick={handleAddStage}
            >
              <Plus className='h-4 w-4' /> Add Stage
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
                      <Plus className='h-4 w-4' /> Add Stage
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  align='center'
                  className='bg-popover text-popover-foreground border-border rounded-md border px-3 py-1.5 text-xs font-semibold shadow-md'
                  side='top'
                >
                  {hasCompletedChapter
                    ? 'Cannot add stages once chapters have reached completion.'
                    : 'You already have 10 stages.'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Fixed Bottom Bookend Card: Complete */}
          <div className='border-border bg-muted/60 text-muted-foreground w-full rounded-md border px-4 py-3.5 text-center text-sm font-bold shadow-2xs select-none'>
            {workflowConfig.find(s => s.id === 'complete')?.label ?? 'Complete'}
          </div>
        </div>

        {/* Footer Done Action */}
        <div className='flex justify-end pt-4'>
          <Button disabled={isUpdating} onClick={handleSave}>
            {isUpdating ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
