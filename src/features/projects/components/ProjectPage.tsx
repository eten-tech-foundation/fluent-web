import { useEffect, useMemo, useRef, useState } from 'react';

import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import useProgressBar from '@/features/projects/hooks/useProgressBar';
import { type Project, type SortOption, type StatusFilter } from '@/lib/types';

import { ViewPageHeader } from './ViewPageHeader';

interface ProjectsPageProps {
  projects: Project[];
  loading?: boolean;
  isManager: boolean;
  onCreateProject: () => void;
  onProjectSelect: (projectId: number) => void;
}

const ProjectProgressBar: React.FC<{ project: Project }> = ({ project }) => {
  const { calculateProgressSegments } = useProgressBar(project.workflowConfig);

  const segments = calculateProgressSegments(project.chapterStatusCounts);

  if (segments.length === 0) {
    return <div className='bg-primary/10 h-[7px] w-full rounded-full' />;
  }

  return (
    <div className='flex h-[7px] w-full overflow-hidden rounded-full'>
      {segments.map((segment, index) => (
        <div
          key={`${segment.status}-${index}`}
          className='transition-all'
          style={{
            width: `${segment.widthPercentage}%`,
            backgroundColor: segment.color,
          }}
        />
      ))}
    </div>
  );
};

// Adding a component for truncated text with tooltip
const TruncatedText: React.FC<{ text: string }> = ({ text }) => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
      }
    };

    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [text]);

  if (!isTruncated) {
    return (
      <div ref={textRef} className='truncate'>
        {text}
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div ref={textRef} className='truncate'>
          {text}
        </div>
      </TooltipTrigger>
      <TooltipContent
        align='start'
        className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
        side='top'
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
};

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

  const columns = [
    { key: 'title', label: t('projectName') },
    { key: 'sourceLanguage', label: t('sourceLanguage') },
    { key: 'targetLanguage', label: t('targetLanguage') },
    { key: 'sourceBible', label: t('sourceBible') },
    { key: 'milestones', label: t('milestones') },
    { key: 'progress', label: t('overallProgress') },
  ];

  const colWidth = `${(100 / columns.length).toFixed(4)}%`;

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

  const handleRowClick = (project: Project) => {
    onProjectSelect(project.id);
  };
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

      <div className='overflow-hidden rounded-lg border shadow'>
        <div className='flex h-full flex-col'>
          {loading ? (
            <div className='flex items-center justify-center gap-2 py-8'>
              <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
              <span className='text-gray-500'>{t('loadingProjects')}</span>
            </div>
          ) : sortedAndFilteredProjects.length === 0 ? (
            <div className='flex items-center justify-center py-8'>
              <span className='text-gray-500'>{t('noProjectsContactAdmin')}</span>
            </div>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className='flex h-full flex-col overflow-y-auto'>
                <Table className='table-fixed'>
                  <TableHeader className='sticky top-0 z-10'>
                    <TableRow className='hover:bg-transparent'>
                      {columns.map(col => (
                        <TableHead
                          key={col.key}
                          className='text-accent-foreground px-6 py-3 text-left text-sm font-semibold tracking-wider'
                          style={{ width: colWidth, textWrap: 'balance' }}
                        >
                          {col.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody className='divide-border divide-y'>
                    {sortedAndFilteredProjects.map(project => (
                      <TableRow
                        key={project.id}
                        className='cursor-pointer border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
                        onClick={() => handleRowClick(project)}
                      >
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'
                          style={{ width: colWidth }}
                        >
                          <TruncatedText text={project.name} />
                        </TableCell>
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'
                          style={{ width: colWidth }}
                        >
                          {project.sourceLanguageName}
                        </TableCell>
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'
                          style={{ width: colWidth }}
                        >
                          {project.targetLanguageName}
                        </TableCell>
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm'
                          style={{ width: colWidth }}
                        >
                          <TruncatedText text={project.sourceName} />
                        </TableCell>
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm'
                          style={{ width: colWidth }}
                        >
                          {project.milestoneCount ?? 0}
                        </TableCell>
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm'
                          style={{ width: colWidth }}
                        >
                          <ProjectProgressBar project={project} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
};
