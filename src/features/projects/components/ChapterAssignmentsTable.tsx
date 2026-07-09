import { useLayoutEffect, useRef, useState } from 'react';

import { Loader2 } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getStatusDisplay } from '@/lib/formatters';
import {
  type ChapterAssignmentProgress,
  type ChapterAssignmentStatus as ChapterAssignmentStatusType,
} from '@/lib/types';

export const TruncatedTableText = ({ text }: { text: string }) => {
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

interface ChapterAssignmentsTableProps {
  assignments: ChapterAssignmentProgress[];
  isLoading: boolean;
  selectedBook: string;
  isManager: boolean;
  selectedAssignments: number[];
  isRowActionsDisabled: boolean;
  onRowClick: (assignment: ChapterAssignmentProgress) => void;
  onCheckboxChange: (assignmentId: number, checked: boolean) => void;
}

export const ChapterAssignmentsTable: React.FC<ChapterAssignmentsTableProps> = ({
  assignments,
  isLoading,
  selectedBook,
  isManager,
  selectedAssignments,
  isRowActionsDisabled,
  onRowClick,
  onCheckboxChange,
}) => {
  const formatProgress = (completedVerses: number, totalVerses: number) =>
    `${completedVerses} of ${totalVerses}`;

  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border'>
      {isLoading ? (
        <div className='flex items-center justify-center gap-2 py-8'>
          <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
          <span className='text-gray-500'>Loading assignments...</span>
        </div>
      ) : assignments.length === 0 ? (
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
                {assignments.map(assignment => (
                  <TableRow
                    key={assignment.assignmentId}
                    className='align-center cursor-pointer border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
                    onClick={() => onRowClick(assignment)}
                  >
                    <TableCell
                      className={`w-12 px-3 py-3 md:px-4 md:py-3.5 lg:px-6 lg:py-4 ${isManager ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''}`}
                      onClick={e => {
                        e.stopPropagation();
                        if (!isRowActionsDisabled && isManager) {
                          onCheckboxChange(
                            assignment.assignmentId,
                            !selectedAssignments.includes(assignment.assignmentId)
                          );
                        }
                      }}
                    >
                      {isManager && (
                        <Checkbox
                          checked={selectedAssignments.includes(assignment.assignmentId)}
                          disabled={isRowActionsDisabled}
                          onCheckedChange={checked =>
                            onCheckboxChange(assignment.assignmentId, !!checked)
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
                      <TruncatedTableText text={assignment.assignedUser?.displayName ?? ''} />
                    </TableCell>
                    <TableCell className='text-popover-foreground px-3 py-3 text-xs md:px-4 md:py-3.5 md:text-sm lg:px-6 lg:py-4 lg:text-base'>
                      <TruncatedTableText text={assignment.peerChecker?.displayName ?? ''} />
                    </TableCell>
                    <TableCell className='text-popover-foreground px-3 py-3 text-xs whitespace-nowrap md:px-4 md:py-3.5 md:text-sm lg:px-6 lg:py-4 lg:text-base'>
                      <TruncatedTableText
                        text={getStatusDisplay(assignment.status as ChapterAssignmentStatusType)}
                      />
                    </TableCell>
                    <TableCell className='text-popover-foreground px-3 py-3 text-xs md:px-4 md:py-3.5 md:text-sm lg:px-6 lg:py-4 lg:text-base'>
                      <TruncatedTableText
                        text={formatProgress(assignment.completedVerses, assignment.totalVerses)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}
    </div>
  );
};
