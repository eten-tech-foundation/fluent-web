import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ViewPageHeader } from '@/features/projects/components/ViewPageHeader';
import useProgressBar from '@/features/projects/hooks/useProgressBar';
import { useProjectUnitBooks } from '@/features/projects/hooks/useProjectUnitBooks';
import { useProjectUsers } from '@/features/projects/hooks/useProjectUsers';
import { useAssignChapters, useChapterAssignments } from '@/hooks/useChapterAssignment';
import { useUsers } from '@/hooks/useUsers';
import { getConnectivityProfileDisplay, getLastActivityDisplay } from '@/lib/formatters';
import { Logger } from '@/lib/services/logger';
import {
  ChapterAssignmentStatus,
  UserRole,
  type ChapterAssignmentProgress,
  type ChapterAssignmentStatus as ChapterAssignmentStatusType,
  type ChapterStatusCounts,
  type ProjectItem,
  type WorkflowStep,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

import { AssignProjectUsers } from './AssignProjectUsers';
import { AssignUsersDialog } from './AssignUsersDialog';
import { ChapterAssignmentsTable } from './ChapterAssignmentsTable';
import { TruncatedCardText } from './TruncatedText';

interface ProjectDetailPageProps {
  projectId?: number | null;
  projectTitle: string;
  projectSourceLanguageName: string;
  projectTargetLanguageName: string;
  projectSource: string;
  projectConnectivityProfile?: string | null;
  projectLastActivityAt?: string | null;
  projectChapterStatusCounts: ChapterStatusCounts;
  projectWorkflowConfig: WorkflowStep[];
  isAddUserOpen?: boolean;
  onBack?: () => void;
  onExport?: () => void;
  onAddUser?: () => void;
  onCloseAddUser?: () => void;
}

const CardProgressBar: React.FC<{
  chapterStatusCounts: ChapterStatusCounts;
  workflowConfig: WorkflowStep[];
}> = ({ chapterStatusCounts, workflowConfig }) => {
  const { legendItems, calculateProgressSegments } = useProgressBar(workflowConfig);
  const segments = calculateProgressSegments(chapterStatusCounts);

  return (
    <div className='space-y-2'>
      <TooltipProvider delayDuration={100}>
        <div className='flex h-[10px] w-full overflow-hidden rounded-full'>
          {segments.length === 0 ? (
            <div className='bg-primary/10 h-full w-full' />
          ) : (
            segments.map((segment, index) => (
              <Tooltip key={`${segment.status}-${index}`}>
                <TooltipTrigger asChild>
                  <div
                    className='h-full cursor-default hover:brightness-95'
                    style={{
                      width: `${segment.widthPercentage}%`,
                      backgroundColor: segment.color,
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent
                  className='bg-popover text-popover-foreground border-border rounded-md border px-2.5 py-1 text-xs font-semibold shadow-md'
                  side='top'
                >
                  {segment.subSegments ? (
                    <div className='space-y-0.5'>
                      {segment.subSegments.map(sub => (
                        <div key={sub.label}>
                          {sub.label}: {sub.percentage}%
                        </div>
                      ))}
                    </div>
                  ) : (
                    `${segment.displayName}: ${Math.round(segment.widthPercentage)}%`
                  )}
                </TooltipContent>
              </Tooltip>
            ))
          )}
        </div>
      </TooltipProvider>

      <div className='grid grid-cols-2 gap-x-8 gap-y-2 pt-1'>
        {legendItems.map(item => (
          <div key={item.key} className='flex items-center gap-2'>
            <div
              className='h-4 w-4 shrink-0 rounded-none'
              style={{ backgroundColor: item.color }}
            />
            <span className='text-muted-foreground text-xs'>{item.displayName}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({
  projectId,
  projectTitle,
  projectSourceLanguageName,
  projectTargetLanguageName,
  projectSource,
  projectConnectivityProfile,
  projectLastActivityAt,
  projectChapterStatusCounts,
  projectWorkflowConfig,
  isAddUserOpen = false,
  onBack,
  onExport,
  onAddUser,
  onCloseAddUser,
}) => {
  const { userdetail } = useAppStore();
  const navigate = useNavigate();

  const [selectedBook, setSelectedBook] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDrafter, setSelectedDrafter] = useState<string>('');
  const [selectedPeerChecker, setSelectedPeerChecker] = useState<string>('');
  const [selectedAssignments, setSelectedAssignments] = useState<number[]>([]);
  const [selectedAssignmentsStatuses, setSelectedAssignmentsStatuses] = useState<string[]>([]);
  const [isRefreshingAfterAssignment, setIsRefreshingAfterAssignment] = useState(false);

  const {
    data: chapterAssignments,
    isLoading: assignmentsLoading,
    isFetching: assignmentsFetching,
  } = useChapterAssignments(projectId ? projectId.toString() : '0');

  const { data: books, isLoading: booksLoading } = useProjectUnitBooks(
    projectId ? projectId.toString() : '0'
  );

  const isManager = userdetail?.role === UserRole.PROJECT_MANAGER;

  const { data: users, isLoading: usersLoading } = useUsers(isManager);

  const { data: projectUsers, isLoading: projectUsersLoading } = useProjectUsers(projectId ?? 0, {
    enabled: isManager && !!projectId,
  });

  const projectTranslators = useMemo(() => {
    if (!projectUsers) return [];
    return projectUsers.filter(
      pu => pu.roleID === UserRole.TRANSLATOR && pu.userId.toString() !== selectedPeerChecker
    );
  }, [projectUsers, selectedPeerChecker]);

  const availablePeerCheckers = useMemo(() => {
    if (!projectUsers) return [];
    return projectUsers.filter(
      pu => pu.roleID === UserRole.TRANSLATOR && pu.userId.toString() !== selectedDrafter
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
  const [detailsHeight, setDetailsHeight] = useState<number>();

  useLayoutEffect(() => {
    const updateHeight = () => {
      if (window.innerWidth >= 1024) {
        setDetailsHeight(undefined);
        return;
      }

      setDetailsHeight(detailsCardRef.current?.offsetHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);

    if (detailsCardRef.current) {
      observer.observe(detailsCardRef.current);
    }

    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  const assignChapterMutation = useAssignChapters(
    projectId ? projectId.toString() : '0',
    getSelectedUserFullName(selectedDrafter),
    getSelectedUserFullName(selectedPeerChecker)
  );

  const filteredAssignments = useMemo(() => {
    if (!chapterAssignments) return [];
    if (!selectedBook || selectedBook === 'all') return chapterAssignments;

    const selectedBookData = books?.find(book => book.bookId.toString() === selectedBook);
    if (!selectedBookData) return chapterAssignments;

    return chapterAssignments.filter(
      assignment => assignment.bookNameEng === selectedBookData.engDisplayName
    );
  }, [chapterAssignments, selectedBook, books]);

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
      const firstSelectedAssignment = chapterAssignments?.find(
        assignment => assignment.assignmentId === selectedAssignments[0]
      );

      const statuses =
        chapterAssignments
          ?.filter(assignment => selectedAssignments.includes(assignment.assignmentId))
          .map(assignment => assignment.status) ?? [];

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
  }, [selectedAssignments, chapterAssignments, projectUsers]);

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
      setSelectedPeerChecker('');
      setSelectedAssignments([]);
      setSelectedAssignmentsStatuses([]);
      setIsDialogOpen(false);
    } catch (error) {
      Logger.logException(error, { context: 'Error Assigning/Unassigning Chapters' });
      setIsRefreshingAfterAssignment(false);
    }
  }, [selectedDrafter, selectedPeerChecker, selectedAssignments, projectId, assignChapterMutation]);

  const handleCheckboxChange = useCallback((assignmentId: number, checked: boolean) => {
    setSelectedAssignments(prev => {
      if (checked) {
        return prev.includes(assignmentId) ? prev : [...prev, assignmentId];
      } else {
        return prev.filter(id => id !== assignmentId);
      }
    });
  }, []);

  if (isRefreshingAfterAssignment && !assignmentsFetching) {
    setIsRefreshingAfterAssignment(false);
  }

  if (!projectId) {
    return (
      <div className='flex h-full items-center justify-center'>
        <span>Project not found</span>
      </div>
    );
  }

  const headerTitle = `${projectTargetLanguageName} - ${projectTitle}`;
  const isLoadingData = assignmentsLoading || assignChapterMutation.isPending;
  const isDisabled = booksLoading || !books?.length || !chapterAssignments?.length;

  return (
    <div className='mx-auto flex h-full min-w-[730px] flex-col'>
      <ViewPageHeader
        rightContent={
          <Button
            className='border-primary text-primary hover flex items-center gap-2 border-2'
            disabled={isDisabled}
            size='sm'
            variant={'outline'}
            onClick={onExport}
          >
            Export Project
          </Button>
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
                <label className='text-base font-bold'>Title</label>
                <TruncatedCardText text={projectTitle} />

                <label className='text-base font-bold'>Target Language</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {projectTargetLanguageName}
                </p>

                <label className='text-base font-bold'>Source Language</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {projectSourceLanguageName}
                </p>

                <label className='text-base font-bold'>Source Bible</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {projectSource}
                </p>

                <label className='text-base font-bold'>Connectivity Profile</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {getConnectivityProfileDisplay(projectConnectivityProfile)}
                </p>

                <label className='text-base font-bold'>Last Activity</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {getLastActivityDisplay(projectLastActivityAt)}
                </p>
              </div>
              <CardProgressBar
                chapterStatusCounts={projectChapterStatusCounts}
                workflowConfig={projectWorkflowConfig}
              />
            </CardContent>
          </Card>

          {/* Project Users Section - Managers only */}
          {isManager && (
            <div className='flex-1 lg:flex-none'>
              <AssignProjectUsers
                isAddUserOpen={isAddUserOpen}
                projectId={projectId}
                referenceHeight={detailsHeight}
                users={users}
                usersLoading={usersLoading}
                onAddUser={onAddUser}
                onCloseAddUser={onCloseAddUser}
              />
            </div>
          )}
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
                  {books?.map(book => (
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
                    (projectUsers?.filter(pu => pu.roleID === UserRole.TRANSLATOR).length ?? 0) < 2
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
    </div>
  );
};
