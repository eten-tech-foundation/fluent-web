import { useMemo } from 'react';

import { getRouteApi, useLocation, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import { useProjectDetails } from '@/features/projects/hooks/useProjectDetails';
import { useProjectUnitBooks } from '@/features/projects/hooks/useProjectUnitBooks';
import { useChapterAssignments } from '@/hooks/useChapterAssignment';
import { ROLES } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { ExportProjectDialog } from './ExportProjectDialog';
import { ProjectDetailPage } from './ProjectDetailPage';

const routeApi = getRouteApi('/_authenticated/projects/$projectId/');

export const ProjectDetailWrapper: React.FC = () => {
  const navigate = useNavigate();
  const { projectId } = routeApi.useParams();
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
  const { userdetail } = useAppStore();

  const handleBack = () => {
    const from = (location.state as { from?: string } | undefined)?.from;
    if (from) {
      void navigate({ to: from, replace: true });
      return;
    }

    if (userdetail?.role === ROLES.PROJECT_OBSERVER) {
      void navigate({ to: '/' });
    } else {
      void navigate({ to: '/projects' });
    }
  };

  const handleOpenExport = () => {
    void navigate({
      to: '/projects/$projectId',
      params: { projectId },
      search: { modal: 'export' as const },
      state: location.state,
    });
  };

  const handleCloseExport = () => {
    void navigate({
      to: '/projects/$projectId',
      params: { projectId },
      search: {},
      state: location.state,
    });
  };

  const handleOpenAddUser = () => {
    void navigate({
      to: '/projects/$projectId',
      params: { projectId },
      search: { modal: 'add' as const },
      state: location.state,
    });
  };

  const handleCloseAddUser = () => {
    void navigate({
      to: '/projects/$projectId',
      params: { projectId },
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

    return books.map(book => {
      const bookAssignments = chapterAssignments.filter(
        assignment => assignment.bookNameEng === book.engDisplayName
      );

      const completedChapters = bookAssignments.filter(
        assignment => assignment.completedVerses === assignment.totalVerses
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
        <span className='text-gray-500'>Loading project details...</span>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className='flex h-full items-center justify-center'>
        <span className='text-red-500'>
          {projectError ? 'Failed to load project details' : 'Project not found'}
        </span>
      </div>
    );
  }

  return (
    <>
      <ProjectDetailPage
        isAddUserOpen={modal === 'add'}
        projectChapterStatusCounts={project.chapterStatusCounts}
        projectConnectivityProfile={project.metadata.connectivityProfile}
        projectId={project.id}
        projectLastActivityAt={project.lastActivityAt}
        projectSource={project.sourceName}
        projectSourceLanguageName={project.sourceLanguageName}
        projectTargetLanguageName={project.targetLanguageName}
        projectTitle={project.name}
        projectWorkflowConfig={project.workflowConfig}
        onAddUser={handleOpenAddUser}
        onBack={handleBack}
        onCloseAddUser={handleCloseAddUser}
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
