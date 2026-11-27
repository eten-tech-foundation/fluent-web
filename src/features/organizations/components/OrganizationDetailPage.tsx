import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectsTable } from '@/features/projects/components/ProjectsTable';
import { ViewPageHeader } from '@/features/projects/components/ViewPageHeader';
import { getOrgRoleName } from '@/lib/grant-utils';
import { getDisplayRole, type OrganizationSummary, type Project, type User } from '@/lib/types';

/** The tabs of the Super Admin's organization page (#566). Members opens by default. */
export type OrganizationTab = 'members' | 'projects';

interface OrganizationDetailPageProps {
  organization: OrganizationSummary | undefined;
  members: User[];
  projects: Project[];
  /** The organization or its members are loading. */
  loading?: boolean;
  projectsLoading?: boolean;
  /** The projects failed to load: say so instead of showing none. */
  projectsError?: boolean;
  activeTab: OrganizationTab;
  onTabChange: (tab: OrganizationTab) => void;
  onBack: () => void;
  onInviteOrgManager: () => void;
  onProjectSelect: (projectId: number) => void;
}

const headClass =
  'text-accent-foreground w-1/4 px-6 py-3 text-left text-sm font-semibold tracking-wider';
const cellClass = 'text-popover-foreground px-6 py-4 text-sm whitespace-nowrap';
// Underlined tabs in the primary color, like the Add Milestone dialog's.
const tabTriggerClass =
  'text-muted-foreground hover:text-foreground data-[state=active]:text-primary after:bg-primary mr-5 flex-none px-1 text-sm font-semibold';
const tabContentClass = 'flex min-h-0 flex-col pt-4';

export const OrganizationDetailPage: React.FC<OrganizationDetailPageProps> = ({
  organization,
  members,
  projects,
  loading,
  projectsLoading,
  projectsError,
  activeTab,
  onTabChange,
  onBack,
  onInviteOrgManager,
  onProjectSelect,
}) => {
  const { t } = useTranslation();

  const sortedMembers = [...members].sort((a, b) => a.username.localeCompare(b.username));
  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));

  const counts =
    organization && !loading && !projectsLoading
      ? [
          t('memberCount', { count: members.length }),
          t('orgManagerCount', { count: organization.orgManagerCount }),
          // Leave the project count out when the projects failed to load, rather than claim 0.
          ...(projectsError ? [] : [t('projectCount', { count: projects.length })]),
        ].join(' · ')
      : undefined;

  return (
    <div className='flex h-full flex-col'>
      {/* The blank line holds the counts' place while they load, so the tabs don't jump. */}
      <ViewPageHeader
        subtitle={counts ?? <>&nbsp;</>}
        title={organization?.name ?? ''}
        onBack={onBack}
      />

      <Tabs
        className='min-h-0 flex-1'
        value={activeTab}
        onValueChange={value => onTabChange(value === 'projects' ? 'projects' : 'members')}
      >
        <TabsList className='w-full justify-start border-b' variant='line'>
          <TabsTrigger className={tabTriggerClass} value='members'>
            {t('members')}
          </TabsTrigger>
          <TabsTrigger className={tabTriggerClass} value='projects'>
            {t('projects')}
          </TabsTrigger>
        </TabsList>

        <TabsContent className={tabContentClass} value='members'>
          <div className='flex shrink-0 items-center justify-between pb-4'>
            <h2 className='text-xl font-bold'>{t('members')}</h2>
            <Button
              className='border-primary text-primary hover hover:bg-primary/5 flex items-center gap-2 border-2 bg-transparent px-3 py-1 text-sm font-medium'
              disabled={!organization}
              onClick={onInviteOrgManager}
            >
              <Plus className='h-4 w-4' /> {t('inviteOrgManager')}
            </Button>
          </div>

          <div className='flex flex-col overflow-hidden rounded-lg border shadow'>
            {loading ? (
              <div className='flex items-center justify-center gap-2 py-8'>
                <Loader2 className='h-5 w-5 animate-spin' />
                <span>Loading...</span>
              </div>
            ) : sortedMembers.length === 0 ? (
              <div className='flex items-center justify-center py-8'>
                <span>{t('noMembersYet')}</span>
              </div>
            ) : (
              <div className='flex h-full flex-col overflow-y-auto'>
                <Table className='table-fixed'>
                  <TableHeader className='sticky top-0 z-10'>
                    <TableRow className='bg-accent'>
                      <TableHead className={headClass}>{t('name')}</TableHead>
                      <TableHead className={headClass}>{t('role')}</TableHead>
                      <TableHead className={headClass}>{t('email')}</TableHead>
                      <TableHead className={headClass}>{t('status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className='divide-border divide-y'>
                    {sortedMembers.map(member => (
                      <TableRow key={member.id}>
                        <TableCell className={cellClass}>
                          <div className='truncate'>{member.username}</div>
                        </TableCell>
                        <TableCell className={cellClass}>
                          {getDisplayRole(
                            getOrgRoleName(member.orgGrants ?? member.grants, organization?.id) ??
                              'No Role'
                          )}
                        </TableCell>
                        <TableCell className={cellClass}>
                          <div className='truncate'>{member.email}</div>
                        </TableCell>
                        <TableCell className='px-6 py-4 whitespace-nowrap'>
                          <Badge variant={member.status === 'invited' ? 'primary' : 'accent'}>
                            {member.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent className={tabContentClass} value='projects'>
          <h2 className='shrink-0 pb-4 text-xl font-bold'>{t('projects')}</h2>
          {/* Super Admins only open projects here; Org Managers create them (#566). */}
          <ProjectsTable
            emptyMessage={projectsError ? t('orgProjectsLoadFailed') : t('noOrgProjectsYet')}
            loading={projectsLoading}
            projects={sortedProjects}
            onProjectSelect={onProjectSelect}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
