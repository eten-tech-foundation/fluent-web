import { useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
import { type Book, type ChapterAssignmentProgress, type User } from '@/lib/types';

import { type Milestone } from '../hooks/useMilestones';
import { type ProjectDetails } from '../hooks/useProjectDetails';

import { AddMilestoneDialog } from './AddMilestoneDialog';
import { AssignProjectUsers } from './AssignProjectUsers';
import { CardProgressBar } from './CardProgressBar';
import { TruncatedCardText } from './TruncatedText';
import { ViewPageHeader } from './ViewPageHeader';

interface ProjectDetailPageProps {
  project: ProjectDetails;
  isManager: boolean;
  users: User[] | undefined;
  usersLoading: boolean;
  isAddUserOpen: boolean;
  onAddUser: () => void;
  onCloseAddUser: () => void;
  onBack: () => void;
  milestones: Milestone[] | undefined;
  milestonesLoading: boolean;
  books?: Book[];
  chapterAssignments: ChapterAssignmentProgress[] | undefined;
}

interface DisplayStatus {
  label: string;
  bg: string;
  text: string;
}

function getMilestoneDisplayStatus(
  chapterStatusCounts: Record<string, number>,
  t: (key: string) => string
): DisplayStatus {
  const totalChapters = Object.values(chapterStatusCounts).reduce(
    (acc, curr) => acc + Number(curr),
    0
  );
  const completedChapters = chapterStatusCounts.complete;
  const percentComplete = totalChapters === 0 ? 0 : (completedChapters / totalChapters) * 100;

  if (percentComplete >= 100) {
    return {
      label: t('milestoneStatusComplete'),
      bg: 'var(--primary)',
      text: 'var(--primary-foreground)',
    };
  }
  if (percentComplete > 0) {
    return {
      label: t('milestoneStatusInProgress'),
      bg: 'var(--warning)',
      text: 'var(--warning-foreground)',
    };
  }
  return {
    label: t('milestoneStatusNotStarted'),
    bg: 'var(--muted)',
    text: 'var(--muted-foreground)',
  };
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
  chapterAssignments,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);

  return (
    <div className='mx-auto flex h-full min-w-[730px] flex-col'>
      <ViewPageHeader
        rightContent={
          isManager ? (
            <Button
              className='border-primary text-primary hover hover:bg-primary/5 flex items-center gap-2 border-2 bg-transparent px-3 py-1 text-sm font-medium'
              onClick={() => setIsAddMilestoneOpen(true)}
            >
              <Plus className='h-4 w-4' /> {t('addMilestone')}
            </Button>
          ) : undefined
        }
        title={project.name}
        onBack={onBack}
      />

      <div className='flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-6'>
        {/* Left Column: Meta Card & Users */}
        <div className='flex shrink-0 flex-row gap-4 lg:w-1/4 lg:flex-col lg:overflow-y-auto'>
          <Card className='h-fit flex-1 lg:flex-none'>
            <CardContent className='space-y-4 py-4'>
              <div className='grid grid-cols-2 gap-2'>
                <label className='text-base font-bold'>{t('project')}</label>
                <TruncatedCardText text={project.name} />

                <label className='text-base font-bold'>{t('sourceLanguage')}</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {project.sourceLanguageName}
                </p>

                <label className='text-base font-bold'>{t('sourceBible')}</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {project.sourceName}
                </p>

                <label className='text-base font-bold'>{t('targetLanguage')}</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {project.targetLanguageName}
                </p>
                <label className='text-base font-bold'>{t('connectivityProfile')}</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {getConnectivityProfileDisplay(project.metadata.connectivityProfile)}
                </p>

                <label className='text-base font-bold'>{t('milestones')}</label>
                <p className='text-base font-medium text-gray-600 dark:text-gray-400'>
                  {milestones?.length ?? 0}
                </p>
              </div>

              <div>
                <label className='text-base font-bold'>{t('projectProgress')}</label>
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
                chapterAssignments={chapterAssignments}
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
            <h2 className='text-xl font-bold'>{t('milestones')}</h2>
          </div>

          <div className='flex-1 overflow-hidden rounded-lg border shadow'>
            {milestonesLoading ? (
              <div className='flex h-full items-center justify-center gap-2'>
                <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
                <span className='text-gray-500'>{t('loadingMilestones')}</span>
              </div>
            ) : milestones?.length === 0 ? (
              <div className='flex h-full items-center justify-center'>
                <span className='text-gray-500'>{t('noMilestonesFound')}</span>
              </div>
            ) : (
              <div className='flex h-full flex-col overflow-y-auto'>
                <Table className='table-fixed'>
                  <TableHeader className='sticky top-0 z-10'>
                    <TableRow>
                      <TableHead className='w-[35%] px-6 py-3 text-left text-sm font-semibold'>
                        {t('milestoneColumnMilestone')}
                      </TableHead>
                      <TableHead className='px-6 py-3 text-left text-sm font-semibold'>
                        {t('milestoneColumnScope')}
                      </TableHead>
                      <TableHead className='px-6 py-3 text-left text-sm font-semibold'>
                        {t('milestoneColumnProgress')}
                      </TableHead>
                      <TableHead className='px-6 py-3 text-left text-sm font-semibold'>
                        {t('milestoneColumnStatus')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className='divide-border divide-y'>
                    {milestones?.map(milestone => {
                      const totalChapters = Object.values(milestone.chapterStatusCounts).reduce(
                        (acc, curr) => acc + Number(curr),
                        0
                      );
                      const displayStatus = getMilestoneDisplayStatus(
                        milestone.chapterStatusCounts,
                        t
                      );

                      return (
                        <TableRow
                          key={milestone.id}
                          className='cursor-pointer border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
                          onClick={() =>
                            navigate({
                              to: '/projects/$projectId/milestones/$milestoneId',
                              params: {
                                projectId: project.id.toString(),
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
                                      .map(id => {
                                        const b = books.find(bk => bk.bookId === id);
                                        return b ? b.engDisplayName : undefined;
                                      })
                                      .filter((name): name is string => Boolean(name));
                                    if (bookNames.length <= 4) return bookNames.join(', ');
                                    return `${bookNames.slice(0, 4).join(', ')} ...`;
                                  })()}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className='text-popover-foreground px-6 py-4 text-sm'>
                            {t('milestoneScopeSummary', {
                              bookCount: milestone.bookCount,
                              chapterCount: totalChapters,
                            })}
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
