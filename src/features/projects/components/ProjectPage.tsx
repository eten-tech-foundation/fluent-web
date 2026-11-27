import { useMemo, useState } from 'react';

import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Project, type SortOption, type StatusFilter } from '@/lib/types';

import { ProjectsTable } from './ProjectsTable';
import { ViewPageHeader } from './ViewPageHeader';

interface ProjectsPageProps {
  projects: Project[];
  loading?: boolean;
  isManager: boolean;
  onCreateProject: () => void;
  onProjectSelect: (projectId: number) => void;
}

const STALLED_THRESHOLD_DAYS = 10;
type StatusChip = { label: string; bg: string; text: string; filterValue: StatusFilter } | null;

const deriveStatusChip = (
  status: string,
  lastChapterActivity: string | null | undefined,
  t: (key: string) => string
): StatusChip => {
  if (status === 'not_assigned') {
    return {
      label: t('statusNotAssigned'),
      bg: 'var(--popover)',
      text: 'var(--foreground)',
      filterValue: 'not_assigned',
    };
  }

  if (status === 'active' && lastChapterActivity) {
    const diffDays = (Date.now() - new Date(lastChapterActivity).getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays > STALLED_THRESHOLD_DAYS) {
      return {
        label: t('statusPotentiallyStalled'),
        bg: 'var(--warning)',
        text: 'var(--warning-foreground)',
        filterValue: 'potentially_stalled',
      };
    }
  }

  return null;
};

type EnrichedProject = Project & { statusChip: StatusChip };

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  loading,
  projects,
  isManager,
  onCreateProject,
  onProjectSelect,
}) => {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<SortOption>('title');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const sortedAndFilteredProjects = useMemo(() => {
    const enriched: EnrichedProject[] = projects.map(project => ({
      ...project,
      statusChip: deriveStatusChip(project.status, project.lastChapterActivity, t),
    }));

    const sorted = enriched.sort((a, b) => {
      switch (sortBy) {
        case 'recent': {
          const dateA = a.lastChapterActivity ? new Date(a.lastChapterActivity).getTime() : 0;
          const dateB = b.lastChapterActivity ? new Date(b.lastChapterActivity).getTime() : 0;
          return dateB - dateA;
        }
        case 'title':
          return a.name.localeCompare(b.name);
        case 'targetLanguage':
          return a.targetLanguageName.localeCompare(b.targetLanguageName);
        default:
          return 0;
      }
    });

    if (statusFilter === 'all') return sorted;

    return sorted.filter(project => project.statusChip?.filterValue === statusFilter);
  }, [projects, sortBy, statusFilter, t]);

  return (
    <div className='flex h-full flex-col'>
      <div className='shrink-0'>
        <ViewPageHeader
          rightContent={
            isManager ? (
              <Button
                className='border-primary text-primary hover hover:bg-primary/5 flex items-center gap-2 border-2 bg-transparent px-3 py-1 text-sm font-medium'
                onClick={onCreateProject}
              >
                <Plus className='h-4 w-4' /> {t('createProject')}
              </Button>
            ) : undefined
          }
          title={t('projects')}
        />
        <div className='mb-6 flex items-center gap-4'>
          <Select value={sortBy} onValueChange={value => setSortBy(value as SortOption)}>
            <SelectTrigger className='h-10! w-[165px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='recent'>{t('sortRecent')}</SelectItem>
              <SelectItem value='title'>{t('sortTitle')}</SelectItem>
              <SelectItem value='targetLanguage'>{t('targetLanguage')}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={value => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className='h-10! w-[185px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('statusShowAll')}</SelectItem>
              <SelectItem value='potentially_stalled'>{t('statusPotentiallyStalled')}</SelectItem>
              <SelectItem value='not_assigned'>{t('statusNotAssigned')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ProjectsTable
        emptyMessage={
          isManager
            ? t('noProjectsContactAdmin')
            : t('noProjectsContactManager', 'No projects yet. Contact your project manager.')
        }
        loading={loading}
        projects={sortedAndFilteredProjects}
        onProjectSelect={onProjectSelect}
      />
    </div>
  );
};
