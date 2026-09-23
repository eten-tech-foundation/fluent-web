import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { EllipsisVertical, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ViewPageHeader } from '@/features/projects/components/ViewPageHeader';
import { useProjectBooks } from '@/features/projects/hooks/useProjectUnitBooks';
import { useProjectUsers } from '@/features/projects/hooks/useProjectUsers';
import { useAssignChapters, useChapterAssignments } from '@/hooks/useChapterAssignment';
import { getLastActivityDisplay } from '@/lib/formatters';
import { getActiveGrants, isProjectManager } from '@/lib/grant-utils';
import { Logger } from '@/lib/services/logger';
import {
  ChapterAssignmentStatus,
  ROLES,
  type ChapterAssignmentProgress,
  type ChapterAssignmentStatus as ChapterAssignmentStatusType,
  type ChapterStatusCounts,
  type ProjectItem,
  type WorkflowStep,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

import { AssignUsersDialog } from './AssignUsersDialog';
import { CardProgressBar } from './CardProgressBar';
import { ChapterAssignmentsTable } from './ChapterAssignmentsTable';
import { ManageMilestoneBooksDialog } from './ManageMilestoneBooksDialog';
import { TruncatedCardText } from './TruncatedText';

interface MilestoneDetailPageProps {
  projectId?: number | null;
  milestoneId?: number | null;
  milestoneName?: string;
  projectTitle: string;
  projectTargetLanguageName: string;
  projectSource: string;
  projectSourceBibleId: number;
  projectWorkflowConfig: WorkflowStep[];
  onBack?: () => void;
  onExport?: () => void;
  onEditMetadata?: () => void;
  milestoneUpdatedAt?: string;
}

export const MilestoneDetailPage: React.FC<MilestoneDetailPageProps> = ({
  projectId,
  milestoneId,
  milestoneName,
  projectTitle,
  projectTargetLanguageName,
  projectSource,
  projectSourceBibleId,
  projectWorkflowConfig,
  onBack,
  onExport,
  onEditMetadata,
  milestoneUpdatedAt,
}) => {
  const { t } = useTranslation();
  const { userdetail } = useAppStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedBook, setSelectedBook] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isManageBooksOpen, setIsManageBooksOpen] = useState(false);
  const [selectedDrafter, setSelectedDrafter] = useState<string>('');
  const [selectedPeerChecker, setSelectedPeerChecker] = useState<string>('');
  const [selectedAssignments, setSelectedAssignments] = useState<number[]>([]);
  const [selectedAssignmentsStatuses, setSelectedAssignmentsStatuses] = useState<string[]>([]);
  const [isRefreshingAfterAssignment, setIsRefreshingAfterAssignment] = useState(false);

  const {
    data: chapterAssignments,
    isLoading: assignmentsLoading,
    isFetching: assignmentsFetching,
  } = useChapterAssignments(projectId ? projectId.toString() : '');

  const { data: allBooks, isLoading: booksLoading } = useProjectBooks(
    projectId ? projectId.toString() : ''
  );

  const milestoneFilteredAssignments = useMemo(() => {
    if (!chapterAssignments) return [];
    if (milestoneId) {
      return chapterAssignments.filter(a => a.projectUnitId === milestoneId);
    }
    return chapterAssignments;
  }, [chapterAssignments, milestoneId]);

  const milestoneBooks = useMemo(() => {
    if (!allBooks) return [];
    if (milestoneId) {
      const validBookIds = new Set(milestoneFilteredAssignments.map(a => a.bookId));
      return allBooks.filter(b => validBookIds.has(b.bookId));
    }
    return allBooks;
  }, [allBooks, milestoneFilteredAssignments, milestoneId]);

  const computedChapterStatusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of milestoneFilteredAssignments) {
      counts[a.status] = (counts[a.status] || 0) + 1;
    }
    return counts as ChapterStatusCounts;
  }, [milestoneFilteredAssignments]);

  const activeOrgId = userdetail?.lastActiveOrgId;
  const activeGrants = getActiveGrants(userdetail?.grants, activeOrgId);

  const isManager = useMemo(
    () => isProjectManager(activeGrants, projectId),
    [activeGrants, projectId]
  );

  const { data: projectUsers, isLoading: projectUsersLoading } = useProjectUsers(projectId ?? 0, {
    enabled: isManager && !!projectId,
  });

  const projectTranslators = useMemo(() => {
    if (!projectUsers) return [];
    return projectUsers.filter(
      pu => pu.roleName === ROLES.PROJECT_TRANSLATOR && pu.userId.toString() !== selectedPeerChecker
    );
  }, [projectUsers, selectedPeerChecker]);

  const availablePeerCheckers = useMemo(() => {
    if (!projectUsers) return [];
    return projectUsers.filter(
      pu => pu.roleName === ROLES.PROJECT_TRANSLATOR && pu.userId.toString() !== selectedDrafter
    );
  }, [projectUsers, selectedDrafter]);

  const getSelectedUserFullName = useCallback(
    (userId: string) => {
      if (!userId || !projectUsers) return '';
      const pu = projectUsers.find(p => p.userId.toString() === userId);
      return pu?.displayName ?? '';
    },
    [projectUsers]
  );

  const detailsCardRef = useRef<HTMLDivElement>(null);

  const assignChapterMutation = useAssignChapters(
    projectId ? projectId.toString() : '0',
    getSelectedUserFullName(selectedDrafter),
    getSelectedUserFullName(selectedPeerChecker)
  );

  const filteredAssignments = useMemo(() => {
    if (!selectedBook || selectedBook === 'all') return milestoneFilteredAssignments;

    const selectedBookData = milestoneBooks.find(book => book.bookId.toString() === selectedBook);
    if (!selectedBookData) return milestoneFilteredAssignments;

    return milestoneFilteredAssignments.filter(
      assignment => assignment.bookNameEng === selectedBookData.engDisplayName
    );
  }, [milestoneFilteredAssignments, selectedBook, milestoneBooks]);

  const handleChapterRowClick = useCallback(
    (assignment: ChapterAssignmentProgress) => {
      if (!userdetail) return;

      const status = assignment.status as ChapterAssignmentStatusType;
      const isAssignedDrafter = assignment.assignedUser?.id === userdetail.id;
      const isAssignedPeerChecker = assignment.peerChecker?.id === userdetail.id;

      const canEdit =
        (isAssignedDrafter && status === ChapterAssignmentStatus.DRAFT) ||
        (isAssignedPeerChecker && status === ChapterAssignmentStatus.PEER_CHECK) ||
        status === ChapterAssignmentStatus.COMMUNITY_REVIEW ||
        status === ChapterAssignmentStatus.LINGUIST_CHECK ||
        status === ChapterAssignmentStatus.THEOLOGICAL_CHECK ||
        status === ChapterAssignmentStatus.CONSULTANT_CHECK;

      const route = canEdit
        ? '/translation/$bookId/$chapterNumber'
        : '/view/$bookId/$chapterNumber';

      const projectItem: ProjectItem = {
        chapterAssignmentId: assignment.assignmentId,
        projectId: projectId ?? 0,
        projectName: projectTitle,
        projectUnitId: assignment.projectUnitId,
        bibleId: assignment.bibleId,
        bibleName: projectSource,
        targetLanguage: projectTargetLanguageName,
        // ISO 639-3 code for the repeated-words check's `lang_code` (BUG #3):
        // the progress endpoint now surfaces this so the PM path no longer
        // sends "<unknown>".
        targetLangCode: assignment.targetLangCode,
        bookId: assignment.bookId,
        book: assignment.bookNameEng,
        chapterStatus: assignment.status,
        chapterNumber: assignment.chapterNumber,
        totalVerses: assignment.totalVerses,
        completedVerses: assignment.completedVerses,
        submittedTime: assignment.submittedTime ? assignment.submittedTime.toString() : null,
        bookCode: assignment.bookCode,
        sourceLangCode: assignment.sourceLangCode,
      };

      void navigate({
        to: route,
        params: {
          bookId: assignment.bookId.toString(),
          chapterNumber: assignment.chapterNumber.toString(),
        },
        search: { t: Date.now().toString() },
        state: { projectItem },
      });
    },
    [userdetail, projectId, projectTitle, projectSource, projectTargetLanguageName, navigate]
  );

  const handleAddBook = useCallback(() => {
    if (selectedAssignments.length > 0) {
      const firstSelectedAssignment = milestoneFilteredAssignments.find(
        assignment => assignment.assignmentId === selectedAssignments[0]
      );

      const statuses = milestoneFilteredAssignments
        .filter(assignment => selectedAssignments.includes(assignment.assignmentId))
        .map(assignment => assignment.status);

      setSelectedAssignmentsStatuses(statuses);

      if (firstSelectedAssignment) {
        const drafterUser = projectUsers?.find(
          pu => pu.displayName === firstSelectedAssignment.assignedUser?.displayName
        );
        const peerCheckerUser = projectUsers?.find(
          pu => pu.displayName === firstSelectedAssignment.peerChecker?.displayName
        );

        setSelectedDrafter(drafterUser ? drafterUser.userId.toString() : '');
        setSelectedPeerChecker(peerCheckerUser ? peerCheckerUser.userId.toString() : '');
      }

      setIsDialogOpen(true);
    }
  }, [selectedAssignments, milestoneFilteredAssignments, projectUsers]);

  const handleAssignUser = useCallback(async () => {
    const drafterId = selectedDrafter === '' ? null : parseInt(selectedDrafter);
    const peerCheckerId = selectedPeerChecker === '' ? null : parseInt(selectedPeerChecker);
    const isUnassigning = drafterId === null && peerCheckerId === null;
    const canProceed =
      (drafterId !== null || isUnassigning) && selectedAssignments.length > 0 && projectId;

    if (!canProceed) return;

    try {
      await assignChapterMutation.mutateAsync({
        projectId: projectId.toString(),
        assignments: selectedAssignments.map(id => ({
          chapterAssignmentId: id,
          drafterId,
          peerCheckerId,
        })),
      });

      setIsRefreshingAfterAssignment(true);
      setSelectedDrafter('');
      await queryClient.invalidateQueries({
        queryKey: ['chapterAssignments', projectId ? projectId.toString() : '0'],
      });
      setIsDialogOpen(false);
      toast.success('Assignment updated successfully');
    } catch (error) {
      Logger.logException(error);
      toast.error('Failed to assign user');
    }
  }, [
    selectedDrafter,
    selectedPeerChecker,
    selectedAssignments,
    projectId,
    assignChapterMutation,
    queryClient,
  ]);

  useEffect(() => {
    if (isRefreshingAfterAssignment && !assignmentsFetching) {
      setIsRefreshingAfterAssignment(false);
    }
  }, [isRefreshingAfterAssignment, assignmentsFetching]);

  const handleCheckboxChange = useCallback((assignmentId: number, checked: boolean) => {
    setSelectedAssignments(prev => {
      if (checked) {
        return prev.includes(assignmentId) ? prev : [...prev, assignmentId];
      } else {
        return prev.filter(id => id !== assignmentId);
      }
    });
  }, []);

  if (!projectId) {
    return (
      <div className='flex h-full items-center justify-center'>
        <span>Project not found</span>
      </div>
    );
  }

  const displayTitle = milestoneName ?? projectTitle;
  const headerTitle = `${projectTargetLanguageName} - ${displayTitle}`;
  const isLoadingData = assignmentsLoading || assignChapterMutation.isPending;
  const isDisabled = booksLoading || !milestoneBooks.length || !milestoneFilteredAssignments.length;

  return (
    <div className='mx-auto flex h-full min-w-[730px] flex-col'>
      <ViewPageHeader
        rightContent={
          <div className='flex items-center gap-2'>
            {isManager && (
              <>
                <Button
                  className='border-primary text-primary hover flex items-center gap-2 border-2'
                  disabled={isDisabled}
                  size='sm'
                  variant={'outline'}
                  onClick={onEditMetadata}
                >
                  {t('editProjectMetadata')}
                </Button>
              </>
            )}
            <Button
              className='border-primary text-primary hover flex items-center gap-2 border-2'
              disabled={isDisabled}
              size='sm'
              variant={'outline'}
              onClick={onExport}
            >
              Export Milestone
            </Button>
            {isManager && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label='More milestone actions'
                    className='text-primary hover px-2'
                    size='sm'
                    variant='outline'
                  >
                    <EllipsisVertical className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem onSelect={() => setIsManageBooksOpen(true)}>
                    Manage Books
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
        title={headerTitle}
        onBack={onBack}
      />

      <div className='flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6'>
        {/* Meta + Users Pane - side by side below 1024px, stacked column at 1024px+ */}
        <div className='flex shrink-0 flex-row gap-4 lg:w-1/4 lg:flex-col lg:overflow-y-auto'>
          {/* Project Details Card */}
          <Card ref={detailsCardRef} className='h-fit flex-1 lg:flex-none'>
            <CardContent className='space-y-4 py-4'>
              <div className='grid grid-cols-2 gap-2'>
                <label className='text-base font-bold'>Project</label>
                <TruncatedCardText text={projectTitle} />

                <label className='text-base font-bold'>Milestone</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {milestoneName}
                </p>
                <label className='text-base font-bold'>Books</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {milestoneBooks.length > 0 && (
                    <span className='text-base font-medium text-gray-600 dark:text-gray-400'>
                      {(() => {
                        const bookNames = milestoneBooks
                          .map(book => book.engDisplayName)
                          .filter(Boolean);
                        if (bookNames.length <= 4) return bookNames.join(', ');
                        return `${bookNames.slice(0, 4).join(', ')} ...`;
                      })()}
                    </span>
                  )}
                </p>
                <label className='text-base font-bold'>Source Bible</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {projectSource}
                </p>
                <label className='text-base font-bold'>Last Activity</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {getLastActivityDisplay(milestoneUpdatedAt)}
                </p>
              </div>

              <div>
                <div className='mt-2'>
                  <CardProgressBar
                    chapterStatusCounts={computedChapterStatusCounts}
                    workflowConfig={projectWorkflowConfig}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table Section */}
        <div className='flex min-h-0 w-full flex-1 flex-col lg:w-3/4 lg:grow'>
          <div className='shrink-0 pb-4 pl-[3px]'>
            <div className='flex items-center gap-3'>
              <Select value={selectedBook} onValueChange={setSelectedBook}>
                <SelectTrigger className='my-0.5 w-[200px] lg:w-[250px]'>
                  <SelectValue placeholder={booksLoading ? 'Loading books...' : 'Book'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Books</SelectItem>
                  {milestoneBooks.map(book => (
                    <SelectItem key={book.bookId} value={book.bookId.toString()}>
                      {book.engDisplayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isManager && (
                <Button
                  className='flex items-center gap-2'
                  disabled={
                    selectedAssignments.length === 0 ||
                    booksLoading ||
                    isLoadingData ||
                    (projectUsers?.filter(pu => pu.roleName === ROLES.PROJECT_TRANSLATOR).length ??
                      0) < 2
                  }
                  size='sm'
                  onClick={handleAddBook}
                >
                  {assignChapterMutation.isPending && (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  Assign
                </Button>
              )}
            </div>
          </div>

          <ChapterAssignmentsTable
            assignments={filteredAssignments}
            isLoading={assignmentsLoading}
            isManager={isManager}
            isRowActionsDisabled={isLoadingData}
            selectedAssignments={selectedAssignments}
            selectedBook={selectedBook}
            onCheckboxChange={handleCheckboxChange}
            onRowClick={handleChapterRowClick}
          />
        </div>
      </div>

      <AssignUsersDialog
        allProjectUsers={projectUsers ?? []}
        availablePeerCheckers={availablePeerCheckers}
        isAssigning={assignChapterMutation.isPending}
        isOpen={isDialogOpen}
        projectUsers={projectTranslators}
        selectedAssignmentsStatuses={selectedAssignmentsStatuses}
        selectedDrafter={selectedDrafter}
        selectedPeerChecker={selectedPeerChecker}
        usersLoading={projectUsersLoading}
        onAssign={handleAssignUser}
        onClose={() => setIsDialogOpen(false)}
        onDrafterChange={setSelectedDrafter}
        onPeerCheckerChange={setSelectedPeerChecker}
      />
      {isManageBooksOpen && milestoneId && projectId && (
        <ManageMilestoneBooksDialog
          isOpen={isManageBooksOpen}
          milestoneId={milestoneId}
          projectId={Number(projectId)}
          sourceBibleId={projectSourceBibleId}
          onClose={() => setIsManageBooksOpen(false)}
        />
      )}
    </div>
  );
};
