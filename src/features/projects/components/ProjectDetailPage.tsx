/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getConnectivityProfileDisplay } from '@/lib/formatters';

import { type BibleBook } from '../hooks/useBibleBooks';
import { type Milestone } from '../hooks/useMilestones';

import { AddMilestoneDialog } from './AddMilestoneDialog';
import { AssignProjectUsers } from './AssignProjectUsers';
import { CardProgressBar } from './CardProgressBar';
import { TruncatedCardText } from './TruncatedText';
import { ViewPageHeader } from './ViewPageHeader';

interface ProjectDetailPageProps {
  project: any;
  isManager: boolean;
  users: any[];
  usersLoading: boolean;
  isAddUserOpen: boolean;
  onAddUser: () => void;
  onCloseAddUser: () => void;
  onBack: () => void;
  milestones: any[] | undefined;
  milestonesLoading: boolean;
  books?: any[];
}

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({
  project,
  isManager,
  users,
  usersLoading,
  isAddUserOpen,
  onAddUser,
  onCloseAddUser,
  onBack,
  milestones,
  milestonesLoading,
  books,
}: any) => {
  const navigate = useNavigate();
  // useTranslation is not used here

  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);

  return (
    <div className='mx-auto flex h-full min-w-[730px] flex-col'>
      <ViewPageHeader
        rightContent={<div className='flex items-center gap-2'></div>}
        title={`${project.targetLanguageName} - ${project.name}`}
        onBack={onBack}
      />

      <div className='flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6'>
        {/* Left Column: Meta Card & Users */}
        <div className='flex shrink-0 flex-row gap-4 lg:w-1/4 lg:flex-col lg:overflow-y-auto'>
          <Card className='h-fit flex-1 lg:flex-none'>
            <CardContent className='space-y-4 py-4'>
              <div className='grid grid-cols-2 gap-2'>
                <label className='text-base font-bold'>Project</label>
                <TruncatedCardText text={project.name} />

                <label className='text-base font-bold'>Source Language</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {project.sourceLanguageName}
                </p>

                <label className='text-base font-bold'>Source Bible</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {project.sourceName}
                </p>

                <label className='text-base font-bold'>Target Language</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {project.targetLanguageName}
                </p>
                <label className='text-base font-bold'>Connectivity Profile</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {getConnectivityProfileDisplay(project.metadata?.connectivityProfile)}
                </p>

                <label className='text-base font-bold'>Milestones</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {milestones?.length ?? 0}
                </p>
              </div>

              <div>
                <label className='text-base font-bold'>Project Progress</label>
                <div className='mt-2'>
                  <CardProgressBar
                    chapterStatusCounts={project.chapterStatusCounts}
                    workflowConfig={project.workflowConfig}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {isManager && (
            <div className='flex-1 lg:flex-none'>
              <AssignProjectUsers
                chapterAssignments={[]}
                isAddUserOpen={isAddUserOpen}
                projectId={project.id}
                referenceHeight={undefined}
                users={users}
                usersLoading={usersLoading}
                onAddUser={onAddUser}
                onCloseAddUser={onCloseAddUser}
              />
            </div>
          )}
        </div>

        {/* Right Column: Milestones Table */}
        <div className='flex min-h-0 w-full flex-1 flex-col lg:w-3/4 lg:grow'>
          <div className='flex shrink-0 items-center justify-between pb-4'>
            <h2 className='text-xl font-bold'>Milestones</h2>
            {isManager && (
              <Button
                className='border-primary text-primary hover hover:bg-primary/5 flex items-center gap-2 border-2 bg-transparent px-3 py-1 text-sm font-medium'
                onClick={() => setIsAddMilestoneOpen(true)}
              >
                <Plus className='h-4 w-4' /> Add Milestone
              </Button>
            )}
          </div>

          <div className='flex-1 overflow-hidden rounded-lg border shadow'>
            {milestonesLoading ? (
              <div className='flex h-full items-center justify-center gap-2'>
                <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
                <span className='text-gray-500'>Loading milestones...</span>
              </div>
            ) : milestones?.length === 0 ? (
              <div className='flex h-full items-center justify-center'>
                <span className='text-gray-500'>No milestones found.</span>
              </div>
            ) : (
              <div className='flex h-full flex-col overflow-y-auto'>
                <Table className='table-fixed'>
                  <TableHeader className='sticky top-0 z-10'>
                    <TableRow>
                      <TableHead className='w-[35%] px-6 py-3 text-left text-sm font-semibold'>
                        Milestone
                      </TableHead>
                      <TableHead className='px-6 py-3 text-left text-sm font-semibold'>
                        Scope
                      </TableHead>
                      <TableHead className='px-6 py-3 text-left text-sm font-semibold'>
                        Progress
                      </TableHead>
                      <TableHead className='px-6 py-3 text-left text-sm font-semibold'>
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className='divide-border divide-y'>
                    {milestones?.map((milestone: Milestone) => {
                      const totalChapters = Object.values(milestone.chapterStatusCounts).reduce(
                        (acc: number, curr: any) => acc + Number(curr),
                        0
                      );

                      // Derive status
                      let displayStatus = null;
                      if (totalChapters === 0) {
                        displayStatus = {
                          label: 'Not Assigned',
                          bg: 'var(--popover)',
                          text: 'var(--foreground)',
                        };
                      } else if (milestone.status === 'completed') {
                        displayStatus = {
                          label: 'Completed',
                          bg: 'var(--primary)',
                          text: 'var(--primary-foreground)',
                        };
                      } else if (milestone.updatedAt) {
                        const diffDays =
                          (Date.now() - new Date(milestone.updatedAt).getTime()) /
                          (1000 * 60 * 60 * 24);
                        if (diffDays > 10) {
                          displayStatus = {
                            label: 'Potentially Stalled',
                            bg: 'var(--warning)',
                            text: 'var(--warning-foreground)',
                          };
                        } else {
                          displayStatus = {
                            label: 'Active',
                            bg: 'var(--primary)',
                            text: 'var(--primary-foreground)',
                          };
                        }
                      } else {
                        displayStatus = {
                          label: 'Not Started',
                          bg: 'var(--muted)',
                          text: 'var(--muted-foreground)',
                        };
                      }

                      return (
                        <TableRow
                          key={milestone.id}
                          className='cursor-pointer border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
                          onClick={() =>
                            navigate({
                              to: '/projects/$projectId/milestones/$milestoneId',
                              params: {
                                projectId: project.id,
                                milestoneId: milestone.id.toString(),
                              },
                            })
                          }
                        >
                          <TableCell className='text-popover-foreground px-6 py-4 text-sm'>
                            <div className='flex flex-col gap-1'>
                              <span className='text-foreground font-medium'>{milestone.name}</span>
                              {milestone.bookIds.length > 0 && books && (
                                <span className='text-xs text-gray-500'>
                                  {(() => {
                                    const bookNames = milestone.bookIds
                                      .map((id: number) => {
                                        const b = books?.find((bk: BibleBook) => bk.bookId === id);
                                        return b ? String(b.engDisplayName) : undefined;
                                      })
                                      .filter(Boolean);
                                    if (bookNames.length <= 4) return bookNames.join(', ');
                                    return `${bookNames.slice(0, 4).join(', ')} ...`;
                                  })()}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className='text-popover-foreground px-6 py-4 text-sm'>
                            {milestone.bookCount} books &middot; {totalChapters} chapters
                          </TableCell>
                          <TableCell className='text-popover-foreground px-6 py-4 text-sm'>
                            <CardProgressBar
                              chapterStatusCounts={milestone.chapterStatusCounts}
                              variant='mini'
                              workflowConfig={project.workflowConfig}
                            />
                          </TableCell>
                          <TableCell className='px-6 py-4'>
                            <span
                              className='inline-block rounded-full px-2 py-1 text-[10px] font-semibold capitalize'
                              style={{
                                backgroundColor: displayStatus.bg,
                                color: displayStatus.text,
                                border: '1px solid var(--border)',
                              }}
                            >
                              {displayStatus.label}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>

      <AddMilestoneDialog
        isOpen={isAddMilestoneOpen}
        projectId={project.id}
        sourceBible={project.sourceBibleId}
        onClose={() => setIsAddMilestoneOpen(false)}
      />
    </div>
  );
};
