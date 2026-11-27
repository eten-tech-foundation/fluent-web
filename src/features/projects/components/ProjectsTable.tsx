import { useEffect, useRef, useState } from 'react';

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProgressBarTrack } from '@/features/projects/components/ProgressBarTrack';
import useProgressBar from '@/features/projects/hooks/useProgressBar';
import { type Project } from '@/lib/types';

interface ProjectsTableProps {
  projects: Project[];
  loading?: boolean;
  /** Shown in place of the table when there are no projects. */
  emptyMessage: string;
  onProjectSelect: (projectId: number) => void;
}

const ProjectProgressBar: React.FC<{ project: Project }> = ({ project }) => {
  const { calculateProgressSegments } = useProgressBar(project.workflowConfig);
  const segments = calculateProgressSegments(project.chapterStatusCounts);

  return <ProgressBarTrack className='h-[7px] w-full' segments={segments} />;
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

/**
 * The table of the Projects list (/projects). The Super Admin's organization page shows an
 * organization's projects with it too (#566), so both read the same columns.
 */
export const ProjectsTable: React.FC<ProjectsTableProps> = ({
  projects,
  loading,
  emptyMessage,
  onProjectSelect,
}) => {
  const { t } = useTranslation();

  const columns = [
    { key: 'title', label: t('projectName') },
    { key: 'sourceLanguage', label: t('sourceLanguage') },
    { key: 'targetLanguage', label: t('targetLanguage') },
    { key: 'sourceBible', label: t('sourceBible') },
    { key: 'milestones', label: t('milestones') },
    { key: 'progress', label: t('overallProgress') },
  ];

  const colWidth = `${(100 / columns.length).toFixed(4)}%`;

  return (
    <div className='overflow-hidden rounded-lg border shadow'>
      <div className='flex h-full flex-col'>
        {loading ? (
          <div className='flex items-center justify-center gap-2 py-8'>
            <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
            <span className='text-gray-500'>{t('loadingProjects')}</span>
          </div>
        ) : projects.length === 0 ? (
          <div className='flex items-center justify-center py-8'>
            <span className='text-gray-500'>{emptyMessage}</span>
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
                  {projects.map(project => (
                    <TableRow
                      key={project.id}
                      className='cursor-pointer border-b transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
                      onClick={() => onProjectSelect(project.id)}
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
  );
};
