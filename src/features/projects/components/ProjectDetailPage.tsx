import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ViewPageHeader } from '@/features/projects/components/ViewPageHeader';
import useProgressBar from '@/features/projects/hooks/useProgressBar';
import { useProjectUnitBooks } from '@/features/projects/hooks/useProjectUnitBooks';
import { useProjectUsers } from '@/features/projects/hooks/useProjectUsers';
import { useAssignChapters, useChapterAssignments } from '@/hooks/useChapterAssignment';
import { useUsers } from '@/hooks/useUsers';
import { getStatusDisplay } from '@/lib/formatters';
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

interface ProjectDetailPageProps {
  projectId?: number | null;
  projectTitle: string;
  projectSourceLanguageName: string;
  projectTargetLanguageName: string;
  projectSource: string;
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
  const { colors, calculateProgressSegments } = useProgressBar(workflowConfig);
  const segments = calculateProgressSegments(chapterStatusCounts);

  return (
    <div className='space-y-2'>
      <TooltipProvider delayDuration={100}>
        <div className='border-border flex h-6 w-full overflow-hidden border'>
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
                  {Math.round(segment.widthPercentage)}%
                </TooltipContent>
              </Tooltip>
            ))
          )}
        </div>
      </TooltipProvider>

      <div className='flex flex-wrap gap-x-2 gap-y-1.5 pt-1'>
        {[...workflowConfig].reverse().map(step => {
          const colorInfo = colors[step.id];
          return (
            <div key={step.id} className='flex items-center gap-2'>
              <div
                className='h-4 w-4 shrink-0 rounded-none'
                style={{ backgroundColor: colorInfo.rgba }}
              />
              <span className='text-muted-foreground text-xs'>{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TruncatedCardText = ({ text }: { text: string }) => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
      }
    };

    checkTruncation();
    let timeoutId: NodeJS.Timeout;
    const debouncedCheck = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkTruncation, 150);
    };
    window.addEventListener('resize', debouncedCheck);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', debouncedCheck);
    };
  }, [text]);

  const content = (
    <div
      ref={textRef}
      className='max-w-full cursor-default truncate text-base font-medium text-gray-600 dark:text-gray-400'
    >
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
          className='bg-popover text-popover-foreground border-border max-w-[350px] rounded-md border px-4 py-2.5 text-sm font-semibold break-all shadow-lg'
          side='bottom'
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const TruncatedTableText = ({ text }: { text: string }) => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
      }
    };

    checkTruncation();
    let timeoutId: NodeJS.Timeout;
    const debouncedCheck = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkTruncation, 150);
    };
    window.addEventListener('resize', debouncedCheck);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', debouncedCheck);
    };
  }, [text]);

  const content = (
    <div ref={textRef} className='max-w-full cursor-default truncate' title=''>
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
          className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
          side='top'
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({
  projectId,
  projectTitle,
  projectSourceLanguageName,
  projectTargetLanguageName,
  projectSource,
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
  } = useChapterAssignments(projectId ? projectId.toString() : '0', userdetail?.email ?? '');

  const { data: books, isLoading: booksLoading } = useProjectUnitBooks(
    projectId ? projectId.toString() : '0',
    userdetail?.email ?? ''
  );

  const isManager = userdetail?.role === UserRole.PROJECT_MANAGER;

  const { data: users, isLoading: usersLoading } = useUsers(userdetail?.email ?? '', isManager);

  const { data: projectUsers, isLoading: projectUsersLoading } = useProjectUsers(
    projectId ?? 0,
    userdetail?.email ?? '',
    { enabled: isManager && !!projectId && !!userdetail.email }
  );

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

  const assignChapterMutation = useAssignChapters(
    projectId ? projectId.toString() : '0',
    userdetail?.email ?? '',
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

  const formatProgress = useCallback((completedVerses: number, totalVerses: number) => {
    return `${completedVerses} of ${totalVerses}`;
  }, []);

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
        projectName: projectTitle,
        projectUnitId: assignment.projectUnitId,
        bibleId: assignment.bibleId,
        bibleName: projectSource,
        targetLanguage: projectTargetLanguageName,
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
    [userdetail, projectTitle, projectSource, projectTargetLanguageName, navigate]
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
      (drafterId !== null || isUnassigning) &&
      selectedAssignments.length > 0 &&
      userdetail?.email &&
      projectId;

    if (!canProceed) return;

    try {
      await assignChapterMutation.mutateAsync({
        projectId: projectId.toString(),
        email: userdetail.email,
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
  }, [
    selectedDrafter,
    selectedPeerChecker,
    selectedAssignments,
    userdetail?.email,
    projectId,
    assignChapterMutation,
  ]);

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
    <div className='flex h-full min-w-[750px] flex-col'>
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

      <div className='flex flex-1 overflow-hidden md:gap-4 lg:gap-6'>
        {/* Left Pane - Project Details + Project Users */}
        <div className='flex w-1/4 shrink-0 flex-col gap-4'>
          {/* Project Details Card */}
          <Card className='h-fit'>
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
              </div>
              <CardProgressBar
                chapterStatusCounts={projectChapterStatusCounts}
                workflowConfig={projectWorkflowConfig}
              />
            </CardContent>
          </Card>

          {/* Project Users Section - Managers only */}
          {isManager && (
            <AssignProjectUsers
              email={userdetail.email}
              isAddUserOpen={isAddUserOpen}
              projectId={projectId}
              users={users}
              usersLoading={usersLoading}
              onAddUser={onAddUser}
              onCloseAddUser={onCloseAddUser}
            />
          )}
        </div>

        {/* Table Section */}
        <div className='flex w-3/4 grow flex-col overflow-hidden'>
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

          <div className='flex h-full flex-col overflow-hidden rounded-lg border'>
            {assignmentsLoading ? (
              <div className='flex items-center justify-center gap-2 py-8'>
                <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
                <span className='text-gray-500'>Loading assignments...</span>
              </div>
            ) : filteredAssignments.length === 0 ? (
              <div className='flex items-center justify-center py-8'>
                <span>
                  {selectedBook && selectedBook !== 'all'
                    ? 'No assignments found for selected book'
                    : 'No assignments found'}
                </span>
              </div>
            ) : (
              <TooltipProvider delayDuration={300}>
                <div className='relative flex h-full flex-col overflow-y-auto'>
                  <Table className='w-full table-fixed'>
                    <TableHeader className='sticky top-0 z-10'>
                      <TableRow className='hover:bg-transparent'>
                        <TableHead className='w-12 px-3 py-2 md:px-4 md:py-2.5 lg:px-6 lg:py-3'>
                          <></>
                        </TableHead>
                        <TableHead className='text-accent-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'>
                          Book
                        </TableHead>
                        <TableHead className='text-accent-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'>
                          Chapter
                        </TableHead>
                        <TableHead className='text-accent-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'>
                          Drafter
                        </TableHead>
                        <TableHead className='text-accent-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'>
                          <TruncatedTableText text='Peer Checker' />
                        </TableHead>
                        <TableHead className='text-accent-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'>
                          Status
                        </TableHead>
                        <TableHead className='text-accent-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'>
                          Progress
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className='divide-border divide-y'>
                      {filteredAssignments.map(assignment => {
                        return (
                          <TableRow
                            key={assignment.assignmentId}
                            className='align-center cursor-pointer border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
                            onClick={() => handleChapterRowClick(assignment)}
                          >
                            <TableCell
                              className={`w-12 px-3 py-3 md:px-4 md:py-3.5 lg:px-6 lg:py-4 ${isManager ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''}`}
                              onClick={e => {
                                e.stopPropagation();
                                if (!isLoadingData && isManager) {
                                  handleCheckboxChange(
                                    assignment.assignmentId,
                                    !selectedAssignments.includes(assignment.assignmentId)
                                  );
                                }
                              }}
                            >
                              {isManager && (
                                <Checkbox
                                  checked={selectedAssignments.includes(assignment.assignmentId)}
                                  disabled={isLoadingData}
                                  onCheckedChange={checked =>
                                    handleCheckboxChange(assignment.assignmentId, !!checked)
                                  }
                                />
                              )}
                            </TableCell>
                            <TableCell className='text-popover-foreground px-3 py-3 text-xs md:px-4 md:py-3.5 md:text-sm lg:px-6 lg:py-4 lg:text-base'>
                              <TruncatedTableText text={assignment.bookNameEng} />
                            </TableCell>
                            <TableCell className='text-popover-foreground px-3 py-3 text-xs whitespace-nowrap md:px-4 md:py-3.5 md:text-sm lg:px-6 lg:py-4 lg:text-base'>
                              {assignment.chapterNumber}
                            </TableCell>
                            <TableCell className='text-popover-foreground px-3 py-3 text-xs md:px-4 md:py-3.5 md:text-sm lg:px-6 lg:py-4 lg:text-base'>
                              <TruncatedTableText
                                text={assignment.assignedUser?.displayName ?? ''}
                              />
                            </TableCell>
                            <TableCell className='text-popover-foreground px-3 py-3 text-xs md:px-4 md:py-3.5 md:text-sm lg:px-6 lg:py-4 lg:text-base'>
                              <TruncatedTableText
                                text={assignment.peerChecker?.displayName ?? ''}
                              />
                            </TableCell>
                            <TableCell className='text-popover-foreground px-3 py-3 text-xs whitespace-nowrap md:px-4 md:py-3.5 md:text-sm lg:px-6 lg:py-4 lg:text-base'>
                              <TruncatedTableText
                                text={getStatusDisplay(
                                  assignment.status as ChapterAssignmentStatusType
                                )}
                              />
                            </TableCell>
                            <TableCell className='text-popover-foreground px-3 py-3 text-xs md:px-4 md:py-3.5 md:text-sm lg:px-6 lg:py-4 lg:text-base'>
                              <TruncatedTableText
                                text={formatProgress(
                                  assignment.completedVerses,
                                  assignment.totalVerses
                                )}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TooltipProvider>
            )}
          </div>
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
