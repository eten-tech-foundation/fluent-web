import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useNavigate, useSearch } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useChapterAssignmentsByUserId } from '@/hooks/useChapterAssignment';
import { getStatusDisplay } from '@/lib/formatters';
import { Logger } from '@/lib/services/logger';
import {
  CHAPTER_STATUS_ORDER,
  type ChapterAssignmentStatus as ChapterAssignmentStatusType,
  type User,
  type UserChapterAssignment,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

const TruncatedProjectCell = ({ text, isNavigating }: { text: string; isNavigating: boolean }) => {
  const textRef = useRef<HTMLSpanElement>(null);
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
    <div className='inline-flex max-w-full items-center gap-2'>
      {isNavigating && <Loader2 className='text-primary h-4 w-4 shrink-0 animate-spin' />}
      <span ref={textRef} className='truncate'>
        {text}
      </span>
    </div>
  );

  if (!isTruncated) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent
        align='start'
        className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
        side='top'
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
};

const TruncatedTextCell = ({ text }: { text: string }) => {
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
    <div ref={textRef} className='truncate' title=''>
      {text}
    </div>
  );

  if (!isTruncated) return content;

  return (
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
  );
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getStatusText = (item: UserChapterAssignment) => {
  return `${item.completedVerses} of ${item.totalVerses}`;
};

export function UserHomePage() {
  const [navigatingToProject, setNavigatingToProject] = useState<string | null>(null);
  const [selectedBooks, setSelectedBooks] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  const { userdetail } = useAppStore();
  const navigate = useNavigate();
  // The active tab lives in the URL so each switch is a browser history
  // entry — Back from My History lands on My Work instead of leaving the page.
  const { tab } = useSearch({ from: '/_authenticated/' });
  const isHistory = tab === 'my-history';
  const { data: chapterAssignmentsData, isLoading: loading } = useChapterAssignmentsByUserId(
    (userdetail as User).id
  );

  // Reset filters when switching tabs
  useEffect(() => {
    setSelectedBooks([]);
    setSelectedStatuses([]);
  }, [isHistory]);

  const myWorkData: UserChapterAssignment[] = useMemo(() => {
    if (!chapterAssignmentsData) return [];
    const unsubmittedAssigned = chapterAssignmentsData.assignedChapters.filter(
      item => item.submittedTime === null
    );
    const allPeerCheck = chapterAssignmentsData.peerCheckChapters;
    return [...unsubmittedAssigned, ...allPeerCheck].sort((a, b) => {
      const aHasCompleted = a.completedVerses > 0;
      const bHasCompleted = b.completedVerses > 0;

      if (aHasCompleted && !bHasCompleted) return -1;
      if (!aHasCompleted && bHasCompleted) return 1;

      if (a.book !== b.book) return a.book.localeCompare(b.book);

      return a.chapterNumber - b.chapterNumber;
    });
  }, [chapterAssignmentsData]);

  const historyData: UserChapterAssignment[] = useMemo(() => {
    if (!chapterAssignmentsData) return [];
    return chapterAssignmentsData.assignedChapters
      .filter(item => {
        return item.submittedTime !== null && item.submittedTime.trim() !== '';
      })
      .sort((a, b) => {
        const dateA = a.submittedTime ? new Date(a.submittedTime).getTime() : 0;
        const dateB = b.submittedTime ? new Date(b.submittedTime).getTime() : 0;
        return dateB - dateA;
      });
  }, [chapterAssignmentsData]);

  const currentData = isHistory ? historyData : myWorkData;

  const bookOptions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const item of currentData) {
      if (!seen.has(item.book)) {
        seen.set(item.book, item.bookId);
      }
    }
    return Array.from(seen.entries())
      .sort(([, aId], [, bId]) => aId - bId)
      .map(([name]) => ({ value: name, label: name }));
  }, [currentData]);

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const item of currentData) seen.add(item.chapterStatus);
    return CHAPTER_STATUS_ORDER.filter((s): s is ChapterAssignmentStatusType => seen.has(s)).map(
      s => ({
        value: s,
        label: getStatusDisplay(s),
      })
    );
  }, [currentData]);

  const filteredData = useMemo(() => {
    let result = currentData;
    if (selectedBooks.length > 0) {
      result = result.filter(item => selectedBooks.includes(item.book));
      result = [...result].sort((a, b) => {
        if (a.bookId !== b.bookId) return a.bookId - b.bookId;
        return a.chapterNumber - b.chapterNumber;
      });
    }
    if (selectedStatuses.length > 0) {
      result = result.filter(item => selectedStatuses.includes(item.chapterStatus));
    }
    return result;
  }, [currentData, selectedBooks, selectedStatuses]);

  const hasActiveFilters = selectedBooks.length > 0 || selectedStatuses.length > 0;
  const isFilteredEmpty = hasActiveFilters && filteredData.length === 0 && currentData.length > 0;
  const emptyMessage = isFilteredEmpty
    ? 'Change or remove the filters to view resources'
    : isHistory
      ? 'No completed work found'
      : 'No work assigned';

  const handleRowClick = async (item: UserChapterAssignment) => {
    const projectKey = `${item.projectUnitId}-${item.bookId}-${item.chapterNumber}`;
    setNavigatingToProject(projectKey);

    try {
      await navigate({
        to:
          isHistory && (item.chapterStatus === 'peer_check' || item.chapterStatus === 'complete')
            ? '/view/$bookId/$chapterNumber'
            : '/translation/$bookId/$chapterNumber',
        params: {
          bookId: item.bookId.toString(),
          chapterNumber: item.chapterNumber.toString(),
        },
        search: {
          t: Date.now().toString(),
        },
        state: { projectItem: item },
      });
    } catch (error) {
      Logger.logException(error, {
        context: 'Failed to navigate',
        projectUnitId: item.projectUnitId.toString(),
        bookId: item.bookId.toString(),
        chapterNumber: item.chapterNumber.toString(),
        isHistory: isHistory.toString(),
      });
    } finally {
      setNavigatingToProject(null);
    }
  };

  return (
    <div className='flex h-[calc(100vh-80px)] flex-col'>
      <h2 className='text-foreground mb-6 shrink-0 text-3xl font-bold'>Translator Dashboard</h2>

      {/* Tab bar */}
      <div className='mb-6 shrink-0'>
        <button
          className={`cursor-pointer border-b-3 px-1 pb-3 text-sm font-medium transition-colors ${
            !isHistory
              ? 'border-primary text-foreground'
              : 'text-foreground border-transparent hover:text-gray-700'
          }`}
          onClick={() => void navigate({ to: '/', search: {} })}
        >
          My Work ({myWorkData.length})
        </button>
        <button
          className={`ml-6 cursor-pointer border-b-3 px-1 pb-3 text-sm font-medium transition-colors ${
            isHistory
              ? 'border-primary text-foreground'
              : 'text-foreground border-transparent hover:text-gray-700'
          }`}
          onClick={() => void navigate({ to: '/', search: { tab: 'my-history' } })}
        >
          My History ({historyData.length})
        </button>
      </div>

      {/* Filter controls */}
      {!loading && (
        <div className='mb-4 flex shrink-0 gap-3'>
          <MultiSelectFilter
            label='Book'
            options={bookOptions}
            selected={selectedBooks}
            onChange={setSelectedBooks}
          />
          <MultiSelectFilter
            label='Status'
            options={statusOptions}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
          />
        </div>
      )}

      <div className='bg-card flex flex-1 flex-col overflow-hidden rounded-lg border shadow'>
        {loading ? (
          <div className='flex items-center justify-center gap-2 py-12'>
            <Loader2 className='text-muted-foreground h-5 w-5 animate-spin' />
            <span className='text-muted-foreground'>Loading...</span>
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className='flex h-full flex-col overflow-y-auto'>
              <Table className='table-fixed'>
                <TableHeader className='sticky top-0 z-10'>
                  <TableRow className='bg-accent'>
                    <TableHead className='text-accent-foreground w-1/4 px-6 py-3 text-left text-sm font-semibold tracking-wider'>
                      Project
                    </TableHead>
                    <TableHead className='text-accent-foreground w-1/4 px-6 py-3 text-left text-sm font-semibold tracking-wider'>
                      Book
                    </TableHead>
                    <TableHead className='text-accent-foreground w-1/4 px-6 py-3 text-left text-sm font-semibold tracking-wider'>
                      Chapter
                    </TableHead>
                    <TableHead className='text-accent-foreground w-1/4 px-6 py-3 text-left text-sm font-semibold tracking-wider'>
                      Status
                    </TableHead>
                    <TableHead className='text-accent-foreground w-1/4 px-6 py-3 text-left text-sm font-semibold tracking-wider'>
                      {isHistory ? 'Submitted Date' : 'Progress'}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className='divide-border bg-background divide-y'>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell className='p-8 text-center' colSpan={5}>
                        {emptyMessage}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map(item => {
                      const projectKey = `${item.projectUnitId}-${item.bookId}-${item.chapterNumber}`;
                      const isNavigating = navigatingToProject === projectKey;

                      return (
                        <TableRow
                          key={projectKey}
                          className='cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
                          onClick={() => handleRowClick(item)}
                        >
                          <TableCell className='text-popover-foreground px-6 py-4 text-sm'>
                            <TruncatedProjectCell
                              isNavigating={isNavigating}
                              text={item.projectName}
                            />
                          </TableCell>
                          <TableCell className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'>
                            <TruncatedTextCell text={item.book} />
                          </TableCell>
                          <TableCell className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'>
                            {item.chapterNumber}
                          </TableCell>
                          <TableCell className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'>
                            {getStatusDisplay(item.chapterStatus as ChapterAssignmentStatusType)}
                          </TableCell>
                          <TableCell className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'>
                            <TruncatedTextCell
                              text={
                                isHistory
                                  ? item.submittedTime
                                    ? formatDate(item.submittedTime)
                                    : 'N/A'
                                  : getStatusText(item)
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
