import { useMemo } from 'react';

import { getRouteApi, useLocation, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { useGetMilestones } from '@/features/projects/hooks/useMilestones';
import { useProjectDetails } from '@/features/projects/hooks/useProjectDetails';
import { useProjectBooks } from '@/features/projects/hooks/useProjectUnitBooks';
import { useChapterAssignments } from '@/hooks/useChapterAssignment';
import { getActiveGrants, isProjectManager } from '@/lib/grant-utils';
import { useAppStore } from '@/store/store';

import { EditProjectMetadataDialog } from './EditProjectMetadataDialog';
import { ExportProjectDialog } from './ExportProjectDialog';
import { MilestoneDetailPage } from './MilestoneDetailPage';

const routeApi = getRouteApi('/_authenticated/projects/$projectId/milestones/$milestoneId');

export const MilestoneDetailWrapper: React.FC = () => {
  const navigate = useNavigate();
  const { projectId, milestoneId } = routeApi.useParams();
  const { modal } = routeApi.useSearch();

  const {
    data: project,
    isLoading: projectLoading,
    error: projectError,
  } = useProjectDetails(projectId);
  const { data: chapterAssignments, isLoading: assignmentsLoading } =
    useChapterAssignments(projectId);
  const { data: books, isLoading: booksLoading } = useProjectBooks(projectId);

  const location = useLocation();
  const { userdetail } = useAppStore();

  const isManager = isProjectManager(
    getActiveGrants(userdetail?.grants, userdetail?.lastActiveOrgId),
    project?.id
  );

  const { data: milestones } = useGetMilestones(projectId);
  const currentMilestone = useMemo(
    () => milestones?.find(m => m.id === Number(milestoneId)),
    [milestones, milestoneId]
  );

  const handleBack = () => {
    const from = (location.state as { from?: string } | undefined)?.from;
    if (from) {
      void navigate({ to: from, replace: true });
      return;
    }
    // Go back to the project hub
    void navigate({ to: '/projects/$projectId', params: { projectId } });
  };

  const handleOpenExport = () => {
    void navigate({
      to: '/projects/$projectId/milestones/$milestoneId',
      params: { projectId, milestoneId },
      search: { modal: 'export' as const },
      state: location.state,
    });
  };

  const handleCloseExport = () => {
    void navigate({
      to: '/projects/$projectId/milestones/$milestoneId',
      params: { projectId, milestoneId },
      search: {},
      state: location.state,
    });
  };

  const handleOpenMetadata = () => {
    void navigate({
      to: '/projects/$projectId/milestones/$milestoneId',
      params: { projectId, milestoneId },
      search: { modal: 'metadata' as const },
      state: location.state,
    });
  };

  const handleCloseMetadata = () => {
    void navigate({
      to: '/projects/$projectId/milestones/$milestoneId',
      params: { projectId, milestoneId },
      search: {},
      state: location.state,
    });
  };

  const projectUnitId = useMemo(() => Number(milestoneId) || null, [milestoneId]);

  const exportBooks = useMemo(() => {
    if (!books || !chapterAssignments || !milestoneId) return [];

    const milestoneAssignments = chapterAssignments.filter(
      a => a.projectUnitId === Number(milestoneId)
    );
    const validBookIds = new Set(milestoneAssignments.map(a => a.bookId));
    const milestoneBooks = books.filter(b => validBookIds.has(b.bookId));

    const assignmentsByBook = new Map<string, typeof chapterAssignments>();
    for (const a of milestoneAssignments) {
      if (!assignmentsByBook.has(a.bookNameEng)) {
        assignmentsByBook.set(a.bookNameEng, []);
      }
      assignmentsByBook.get(a.bookNameEng)?.push(a);
    }

    return milestoneBooks.map(book => {
      const bookAssignments = assignmentsByBook.get(book.engDisplayName) ?? [];
      const completedChapters = bookAssignments.filter(
        a => a.completedVerses === a.totalVerses
      ).length;
      return {
        bookId: book.bookId,
        engDisplayName: book.engDisplayName,
        code: book.code,
        completedChapters,
        totalChapters: bookAssignments.length,
      };
    });
  }, [books, chapterAssignments, milestoneId]);

  if (projectLoading) {
    return (
      <div className='flex h-full items-center justify-center gap-2'>
        <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
        <span className='text-gray-500'>Loading milestone details...</span>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-4'>
        <span className='text-red-500'>Milestone not found</span>
        <button
          className='rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600'
          onClick={handleBack}
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <>
      <MilestoneDetailPage
        milestoneId={Number(milestoneId)}
        milestoneName={currentMilestone?.name}
        milestoneUpdatedAt={currentMilestone?.updatedAt}
        projectId={project.id}
        projectSource={project.sourceName}
        projectSourceBibleId={project.sourceBibleId}
        projectTargetLanguageName={project.targetLanguageName}
        projectTitle={project.name}
        projectWorkflowConfig={project.workflowConfig}
        onBack={handleBack}
        onEditMetadata={handleOpenMetadata}
        onExport={handleOpenExport}
      />
      <ExportProjectDialog
        books={exportBooks}
        isLoading={assignmentsLoading || booksLoading}
        isOpen={modal === 'export'}
        projectName={project.name}
        projectUnitId={projectUnitId}
        onClose={handleCloseExport}
      />
      <EditProjectMetadataDialog
        isOpen={isManager && modal === 'metadata'}
        projectUnitId={projectUnitId}
        onClose={handleCloseMetadata}
      />
    </>
  );
};
