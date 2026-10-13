import { useLayoutEffect, useRef, useState } from 'react';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type ProjectUser } from '@/features/projects/hooks/useProjectUsers';
import { useProjectWorkflow } from '@/features/projects/hooks/useProjectWorkflow';
import { ChapterAssignmentStatus } from '@/lib/types';

interface AssignUsersDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: number;
  selectedDrafter: string;
  selectedPeerChecker: string;
  onDrafterChange: (value: string) => void;
  onPeerCheckerChange: (value: string) => void;
  allProjectUsers: ProjectUser[];
  projectUsers: ProjectUser[];
  availablePeerCheckers: ProjectUser[];
  usersLoading: boolean;
  isAssigning: boolean;
  onAssign: () => void;
  selectedAssignmentsStatuses: string[];
}

export const TruncatedDropdownText = ({
  text,
  className,
}: {
  text: string;
  className?: string;
}) => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
      }
    };

    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [text]);

  const content = (
    <div ref={textRef} className={`cursor-default truncate ${className ?? ''}`}>
      {text}
    </div>
  );

  if (!isTruncated) return content;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent
          align='center'
          className='bg-popover text-popover-foreground border-border wrap-break-words max-w-[350px] rounded-md border text-center text-sm font-semibold shadow-lg'
          side='top'
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const AssignUsersDialog: React.FC<AssignUsersDialogProps> = ({
  isOpen,
  onClose,
  projectId,
  selectedDrafter,
  selectedPeerChecker,
  onDrafterChange,
  onPeerCheckerChange,
  allProjectUsers,
  projectUsers,
  availablePeerCheckers,
  usersLoading,
  isAssigning,
  onAssign,
  selectedAssignmentsStatuses,
}) => {
  const { getStageLabel, getRoleLabel } = useProjectWorkflow(projectId);
  const draftingName = getStageLabel(ChapterAssignmentStatus.DRAFT, 'Drafting');
  const drafterRoleName = getRoleLabel(ChapterAssignmentStatus.DRAFT, 'Drafter');
  const peerCheckName = getStageLabel(ChapterAssignmentStatus.PEER_CHECK, 'Peer Check');
  const peerCheckerRoleName = getRoleLabel(ChapterAssignmentStatus.PEER_CHECK, 'Peer Checker');

  const hasCompleteSelection = !!selectedDrafter && !!selectedPeerChecker;
  const isDraftingComplete = selectedAssignmentsStatuses.some(
    status =>
      status !== ChapterAssignmentStatus.NOT_STARTED && status !== ChapterAssignmentStatus.DRAFT
  );

  const isDrafterDisabled = isDraftingComplete;
  const isPeerCheckerDisabled = selectedAssignmentsStatuses.some(
    status =>
      status !== ChapterAssignmentStatus.NOT_STARTED &&
      status !== ChapterAssignmentStatus.DRAFT &&
      status !== ChapterAssignmentStatus.PEER_CHECK
  );

  const isResetDisabled =
    (!selectedDrafter && !selectedPeerChecker) || isDraftingComplete || usersLoading || isAssigning;

  const allAssignableRolesDisabled = isDrafterDisabled && isPeerCheckerDisabled;

  const isSubmitDisabled =
    !hasCompleteSelection || allAssignableRolesDisabled || usersLoading || isAssigning;

  const handleReset = () => {
    onDrafterChange('');
    onPeerCheckerChange('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Assign Users</DialogTitle>
        </DialogHeader>

        {/* Drafter */}
        <div>
          <div className='mt-1 mb-2 flex items-center gap-1'>
            <span className='text-sm text-red-500'>*</span>
            <label className='block text-sm font-medium'>{drafterRoleName || draftingName}</label>
          </div>
          <Select
            disabled={isDrafterDisabled || usersLoading}
            value={selectedDrafter}
            onValueChange={onDrafterChange}
          >
            <SelectTrigger className='bg-background text-foreground border-input w-full'>
              <SelectValue placeholder={usersLoading ? 'Loading users...' : 'Select a User'}>
                {selectedDrafter ? (
                  <div className='flex w-full'>
                    <TruncatedDropdownText
                      className='w-full max-w-[280px] text-left sm:max-w-[350px]'
                      text={
                        allProjectUsers.find(pu => pu.userId.toString() === selectedDrafter)
                          ?.displayName ?? ''
                      }
                    />
                  </div>
                ) : (
                  <span className='text-muted-foreground'>
                    {usersLoading
                      ? 'Loading users...'
                      : isDrafterDisabled
                        ? `Cannot modify ${draftingName.toLowerCase()} for this status`
                        : 'Select a User'}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {projectUsers.map(pu => (
                <SelectItem key={pu.userId} value={pu.userId.toString()}>
                  <div className='w-[250px] sm:w-[350px]'>
                    <TruncatedDropdownText text={pu.displayName} />
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className='mb-2 flex items-center gap-1'>
            <span className='text-sm text-red-500'>*</span>
            <label className='block text-sm font-medium'>
              {peerCheckerRoleName || peerCheckName}
            </label>
          </div>
          <Select
            disabled={isPeerCheckerDisabled || usersLoading}
            value={selectedPeerChecker}
            onValueChange={onPeerCheckerChange}
          >
            <SelectTrigger className='bg-background text-foreground border-input w-full'>
              <SelectValue placeholder={usersLoading ? 'Loading users...' : 'Select a User'}>
                {selectedPeerChecker ? (
                  <div className='flex w-full'>
                    <TruncatedDropdownText
                      className='w-full max-w-[280px] text-left sm:max-w-[350px]'
                      text={
                        allProjectUsers.find(pu => pu.userId.toString() === selectedPeerChecker)
                          ?.displayName ?? ''
                      }
                    />
                  </div>
                ) : (
                  <span className='text-muted-foreground'>
                    {usersLoading
                      ? 'Loading users...'
                      : isPeerCheckerDisabled
                        ? `Cannot modify ${peerCheckName.toLowerCase()} for this status`
                        : 'Select a User'}
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availablePeerCheckers.map(pu => (
                <SelectItem key={pu.userId} value={pu.userId.toString()}>
                  <div className='w-[250px] sm:w-[350px]'>
                    <TruncatedDropdownText text={pu.displayName} />
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className='flex gap-2'>
          <Button disabled={isResetDisabled} onClick={handleReset}>
            Reset
          </Button>
          <Button disabled={isSubmitDisabled} onClick={onAssign}>
            {isAssigning ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
