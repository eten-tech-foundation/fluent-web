import { useMemo } from 'react';

import { getRouteApi, useLocation, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { useProjectDetails } from '@/features/projects/hooks/useProjectDetails';
import { useProjectUnitBooks } from '@/features/projects/hooks/useProjectUnitBooks';
import { useChapterAssignments } from '@/hooks/useChapterAssignment';

import { ExportProjectDialog } from './ExportProjectDialog';
import { MilestoneDetailPage } from './ProjectDetailPage';

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
  const { data: books, isLoading: booksLoading } = useProjectUnitBooks(projectId);

  const location = useLocation();

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

  const projectUnitId = useMemo(
    () => chapterAssignments?.[0]?.projectUnitId ?? null,
    [chapterAssignments]
  );

  const exportBooks = useMemo(() => {
    if (!books || !chapterAssignments) return [];

    const assignmentsByBook = new Map<string, typeof chapterAssignments>();
    for (const a of chapterAssignments) {
      if (!assignmentsByBook.has(a.bookNameEng)) {
        assignmentsByBook.set(a.bookNameEng, []);
      }
      assignmentsByBook.get(a.bookNameEng)?.push(a);
    }

    return books.map(book => {
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
  }, [books, chapterAssignments]);

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
        projectChapterStatusCounts={project.chapterStatusCounts}
        projectConnectivityProfile={project.metadata.connectivityProfile}
        projectId={project.id}
        projectLastActivityAt={project.lastActivityAt}
        projectSource={project.sourceName}
        projectSourceBibleId={project.sourceBibleId}
        projectSourceLanguageName={project.sourceLanguageName}
        projectTargetLanguageName={project.targetLanguageName}
        projectTitle={project.name}
        projectWorkflowConfig={project.workflowConfig}
        onBack={handleBack}
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
    </>
  );
};
