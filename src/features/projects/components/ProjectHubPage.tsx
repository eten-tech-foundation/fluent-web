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
import { getConnectivityProfileDisplay, getLastActivityDisplay } from '@/lib/formatters';

import { AddMilestoneDialog } from './AddMilestoneDialog';
import { AssignProjectUsers } from './AssignProjectUsers';
import { CardProgressBar } from './CardProgressBar';
import { TruncatedCardText } from './TruncatedText';
import { ViewPageHeader } from './ViewPageHeader';

interface ProjectHubPageProps {
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
}

export const ProjectHubPage: React.FC<ProjectHubPageProps> = ({
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
                <label className='text-base font-bold'>Title</label>
                <TruncatedCardText text={project.name} />
                <label className='text-base font-bold'>Target Language</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {project.targetLanguageName}
                </p>
                <label className='text-base font-bold'>Source Language</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {project.sourceLanguageName}
                </p>
                <label className='text-base font-bold'>Source Bible</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {project.sourceName}
                </p>
                <label className='text-base font-bold'>Connectivity</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {getConnectivityProfileDisplay(project.metadata?.connectivityProfile)}
                </p>
                <label className='text-base font-bold'>Last Activity</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {getLastActivityDisplay(project.lastChapterActivity)}
                </p>
              </div>
              <CardProgressBar
                chapterStatusCounts={project.chapterStatusCounts}
                workflowConfig={project.workflowConfig}
              />
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
                className='flex items-center gap-2'
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
                      <TableHead className='px-6 py-3 text-left text-sm font-semibold'>
                        Milestone Name
                      </TableHead>
                      <TableHead className='px-6 py-3 text-left text-sm font-semibold'>
                        Books
                      </TableHead>
                      <TableHead className='px-6 py-3 text-left text-sm font-semibold'>
                        Progress
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {milestones?.map((milestone: any) => (
                      <TableRow
                        key={milestone.id}
                        className='cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
                        onClick={() =>
                          navigate({
                            to: '/projects/$projectId/milestones/$milestoneId',
                            params: { projectId: project.id, milestoneId: milestone.id },
                          })
                        }
                      >
                        <TableCell className='px-6 py-4'>
                          {milestone.name ?? `Milestone ${milestone.id}`}
                        </TableCell>
                        <TableCell className='px-6 py-4'>
                          {milestone.bookCount ?? 0} books
                        </TableCell>
                        <TableCell className='px-6 py-4'>
                          <CardProgressBar
                            hideLegend
                            chapterStatusCounts={milestone.chapterStatusCounts ?? {}}
                            workflowConfig={project.workflowConfig}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
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
