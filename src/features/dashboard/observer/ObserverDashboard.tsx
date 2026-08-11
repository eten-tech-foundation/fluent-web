import { useEffect, useRef, useState } from 'react';

import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

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
import { useUserProjects } from '@/features/projects/hooks/useProjects';
import { type Project } from '@/lib/types';
import { useAppStore } from '@/store/store';

import { ObserverEmptyState } from './ObserverEmptyState';

/* ------------------------------------------------------------------ */
/*  Reusable sub-components (mirror ProjectPage.tsx patterns)          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Column definition                                                  */
/* ------------------------------------------------------------------ */

const COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'sourceBible', label: 'Source Bible and Language' },
  { key: 'targetLanguage', label: 'Target Language' },
  { key: 'progress', label: 'Progress' },
] as const;

const COL_WIDTH = `${(100 / COLUMNS.length).toFixed(4)}%`;

/* ------------------------------------------------------------------ */
/*  ObserverDashboard                                                  */
/* ------------------------------------------------------------------ */

export const ObserverDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userdetail } = useAppStore();

  const { data: projects = [], isLoading } = useUserProjects(userdetail, 'Project Observer');

  const handleRowClick = (project: Project) => {
    void navigate({
      to: '/projects/$projectId',
      params: { projectId: project.id.toString() },
    });
  };

  return (
    <div className='flex h-full flex-col'>
      <div className='mb-6 shrink-0'>
        <h1 className='text-foreground text-3xl font-semibold'>Observer Dashboard</h1>
      </div>

      <div className='flex-1 overflow-hidden rounded-lg border shadow'>
        <div className='flex h-full flex-col'>
          {isLoading ? (
            <div className='flex items-center justify-center gap-2 py-8'>
              <Loader2 className='h-5 w-5 animate-spin text-gray-500' />
              <span className='text-gray-500'>Loading projects…</span>
            </div>
          ) : projects.length === 0 ? (
            <ObserverEmptyState />
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className='flex h-full flex-col overflow-y-auto'>
                <Table className='table-fixed'>
                  <TableHeader className='sticky top-0 z-10'>
                    <TableRow className='hover:bg-transparent'>
                      {COLUMNS.map(col => (
                        <TableHead
                          key={col.key}
                          className='text-accent-foreground px-6 py-3 text-left text-sm font-semibold tracking-wider'
                          style={{ width: COL_WIDTH, textWrap: 'balance' }}
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
                        onClick={() => handleRowClick(project)}
                      >
                        {/* Title */}
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'
                          style={{ width: COL_WIDTH }}
                        >
                          <TruncatedText text={project.name} />
                        </TableCell>

                        {/* Source Bible and Language */}
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm'
                          style={{ width: COL_WIDTH }}
                        >
                          <TruncatedText
                            text={`${project.sourceName} (${project.sourceLanguageName})`}
                          />
                        </TableCell>

                        {/* Target Language */}
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'
                          style={{ width: COL_WIDTH }}
                        >
                          {project.targetLanguageName}
                        </TableCell>

                        {/* Progress */}
                        <TableCell
                          className='text-popover-foreground px-6 py-4 text-sm'
                          style={{ width: COL_WIDTH }}
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
