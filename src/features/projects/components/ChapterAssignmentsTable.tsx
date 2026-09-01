import { useMemo, useState } from 'react';

import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getStatusDisplay } from '@/lib/formatters';
import {
  type ChapterAssignmentProgress,
  type ChapterAssignmentStatus as ChapterAssignmentStatusType,
} from '@/lib/types';

import { TruncatedTableText } from './TruncatedText';

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
type SortableColumn = 'drafter' | 'peerChecker' | 'status';
type SortDirection = 'asc' | 'desc';

const formatProgress = (completedVerses: number, totalVerses: number): string =>
  `${completedVerses} of ${totalVerses}`;

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
          valA = getStatusDisplay(a.status as ChapterAssignmentStatusType);
          valB = getStatusDisplay(b.status as ChapterAssignmentStatusType);
          break;
      }
      if (!valA && valB) return 1;
      if (valA && !valB) return -1;
      const cmp = valA.localeCompare(valB, undefined, { sensitivity: 'base', numeric: true });
      if (cmp !== 0) {
        return sortDirection === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }, [assignments, sortColumn, sortDirection]);

  const renderSortIcon = (column: SortableColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className='h-3.5 w-3.5 shrink-0 opacity-40' />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className='text-primary h-3.5 w-3.5 shrink-0' />
    ) : (
      <ArrowDown className='text-primary h-3.5 w-3.5 shrink-0' />
    );
  };

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
                  <TableHead className='text-accent-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'>
                    Book
                  </TableHead>
                  <TableHead className='text-accent-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'>
                    Chapter
                  </TableHead>
                  <TableHead
                    className='text-accent-foreground hover:bg-muted/50 cursor-pointer px-3 py-2 text-left text-xs font-semibold tracking-wider select-none md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'
                    onClick={() => handleSort('drafter')}
                  >
                    <div className='flex items-center gap-1.5'>
                      <span>Drafter</span>
                      {renderSortIcon('drafter')}
                    </div>
                  </TableHead>
                  <TableHead
                    className='text-accent-foreground hover:bg-muted/50 cursor-pointer px-3 py-2 text-left text-xs font-semibold tracking-wider select-none md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'
                    onClick={() => handleSort('peerChecker')}
                  >
                    <div className='flex items-center gap-1.5'>
                      <TruncatedTableText text='Peer Checker' />
                      {renderSortIcon('peerChecker')}
                    </div>
                  </TableHead>
                  <TableHead
                    className='text-accent-foreground hover:bg-muted/50 cursor-pointer px-3 py-2 text-left text-xs font-semibold tracking-wider select-none md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'
                    onClick={() => handleSort('status')}
                  >
                    <div className='flex items-center gap-1.5'>
                      <span>Status</span>
                      {renderSortIcon('status')}
                    </div>
                  </TableHead>

                  <TableHead className='text-accent-foreground px-3 py-2 text-left text-xs font-semibold tracking-wider md:px-4 md:py-2.5 md:text-sm lg:px-6 lg:py-3 lg:text-base'>
                    Progress
                  </TableHead>
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
