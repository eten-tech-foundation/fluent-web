import { useMemo, useState } from 'react';

import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, TriangleAlert } from 'lucide-react';

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
import { useProjectWorkflow } from '@/features/projects/hooks/useProjectWorkflow';
import { useTruncation } from '@/features/projects/hooks/useTruncation';
import { getStatusDisplay } from '@/lib/formatters';
import {
  type ChapterAssignmentProgress,
  type ChapterAssignmentStatus as ChapterAssignmentStatusType,
} from '@/lib/types';

import { TruncatedTableText } from './TruncatedText';

interface ChapterAssignmentsTableProps {
  projectId?: number;
  assignments: ChapterAssignmentProgress[];
  isLoading: boolean;
  selectedBook: string;
  isManager: boolean;
  selectedAssignments: number[];
  isRowActionsDisabled: boolean;
  onRowClick: (assignment: ChapterAssignmentProgress) => void;
  onCheckboxChange: (assignmentId: number, checked: boolean) => void;
}

type SortableColumn = 'drafter' | 'peerChecker' | 'status';
type SortDirection = 'asc' | 'desc';

const headerCellClass =
  'text-accent-foreground overflow-hidden px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base';
const sortButtonClass =
  'flex max-w-full min-w-0 cursor-pointer items-center gap-1 select-none hover:opacity-80';

interface SortableHeaderProps {
  column: SortableColumn;
  label: string;
  sortColumn: SortableColumn | null;
  sortDirection: SortDirection | null;
  onSort: (column: SortableColumn) => void;
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
}) => {
  const { ref, isTruncated } = useTruncation<HTMLSpanElement>(label);

  const ariaSort =
    sortColumn === column
      ? sortDirection === 'asc'
        ? 'ascending'
        : sortDirection === 'desc'
          ? 'descending'
          : undefined
      : undefined;

  const sortIcon =
    sortColumn !== column ? (
      <ArrowUpDown className='h-3 w-3 shrink-0 opacity-50' />
    ) : sortDirection === 'asc' ? (
      <ArrowUp className='h-3 w-3 shrink-0' />
    ) : (
      <ArrowDown className='h-3 w-3 shrink-0' />
    );

  const button = (
    <button className={sortButtonClass} type='button' onClick={() => onSort(column)}>
      <span ref={ref} className='max-w-full min-w-0 cursor-pointer truncate'>
        {label}
      </span>
      {sortIcon}
    </button>
  );

  return (
    <TableHead aria-sort={ariaSort} className={headerCellClass}>
      {isTruncated ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent
            align='center'
            className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
            side='top'
          >
            {label}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </TableHead>
  );
};

const formatProgress = (completedVerses: number, totalVerses: number): string =>
  `${completedVerses} of ${totalVerses}`;

export const ChapterAssignmentsTable: React.FC<ChapterAssignmentsTableProps> = ({
  projectId,
  assignments,
  isLoading,
  selectedBook,
  isManager,
  selectedAssignments,
  isRowActionsDisabled,
  onRowClick,
  onCheckboxChange,
}) => {
  const { getStageLabel, getRoleLabel } = useProjectWorkflow(projectId);
  const drafterLabel = getRoleLabel('draft', 'Drafter');
  const peerCheckerLabel = getRoleLabel('peer_check', 'Peer Checker');
  const [sortColumn, setSortColumn] = useState<SortableColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection | null>(null);

  const handleSort = (column: SortableColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      setSortColumn(null);
      setSortDirection(null);
    }
  };

  const sortedAssignments = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return assignments;
    }
    return [...assignments].sort((a, b) => {
      let valA = '';
      let valB = '';
      switch (sortColumn) {
        case 'drafter':
          valA = a.assignedUser?.displayName ?? '';
          valB = b.assignedUser?.displayName ?? '';
          break;
        case 'peerChecker':
          valA = a.peerChecker?.displayName ?? '';
          valB = b.peerChecker?.displayName ?? '';
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
      }
      if (!valA) return 1;
      if (!valB) return -1;
      const cmp = valA.localeCompare(valB);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [assignments, sortColumn, sortDirection]);

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
                    <span className='sr-only'>Select</span>
                  </TableHead>
                  <TableHead className={headerCellClass}>Book</TableHead>
                  <TableHead className={headerCellClass}>Chapter</TableHead>
                  <SortableHeader
                    column='drafter'
                    label={drafterLabel}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column='peerChecker'
                    label={peerCheckerLabel}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    column='status'
                    label='Status'
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <TableHead className={headerCellClass}>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className='divide-border divide-y'>
                {sortedAssignments.map(assignment => (
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
                      <div className='flex items-center gap-1.5'>
                        <TruncatedTableText
                          text={getStatusDisplay(
                            assignment.status as ChapterAssignmentStatusType,
                            getStageLabel
                          )}
                        />
                        {isManager && assignment.hasConflict && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                aria-label='Audio conflict'
                                className='inline-flex items-center'
                                role='img'
                                tabIndex={0}
                              >
                                <TriangleAlert className='h-4 w-4 shrink-0 text-amber-500' />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Audio conflict</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
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
