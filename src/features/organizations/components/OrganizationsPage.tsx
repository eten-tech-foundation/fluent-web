import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ViewPageHeader } from '@/features/projects/components/ViewPageHeader';
import { type OrganizationSummary } from '@/lib/types';

import { formatOrgDate } from './formatOrgDate';

interface OrganizationsPageProps {
  organizations: OrganizationSummary[];
  loading?: boolean;
  onCreateOrganization: () => void;
  onSelectOrganization: (orgId: number) => void;
}

const headClass = 'text-accent-foreground px-6 py-3 text-left text-sm font-semibold tracking-wider';
const cellClass = 'text-popover-foreground px-6 py-4 text-sm whitespace-nowrap';

export const OrganizationsPage: React.FC<OrganizationsPageProps> = ({
  organizations,
  loading,
  onCreateOrganization,
  onSelectOrganization,
}) => {
  const { t } = useTranslation();

  return (
    <div className='flex h-full flex-col'>
      <div className='shrink-0'>
        <ViewPageHeader
          rightContent={
            <Button
              className='border-primary text-primary hover hover:bg-primary/5 flex items-center gap-2 border-2 bg-transparent px-3 py-1 text-sm font-medium'
              onClick={onCreateOrganization}
            >
              <Plus className='h-4 w-4' /> {t('createOrganization')}
            </Button>
          }
          title={t('organizations')}
        />
      </div>

      <div className='flex flex-col overflow-hidden rounded-lg border shadow'>
        {loading ? (
          <div className='flex items-center justify-center gap-2 py-8'>
            <Loader2 className='h-5 w-5 animate-spin' />
            <span>Loading...</span>
          </div>
        ) : organizations.length === 0 ? (
          <div className='flex items-center justify-center py-8'>
            <span>{t('noOrganizationsFound')}</span>
          </div>
        ) : (
          <div className='flex h-full flex-col overflow-y-auto'>
            <Table className='table-fixed'>
              <TableHeader className='sticky top-0 z-10'>
                <TableRow className='bg-accent'>
                  <TableHead className={`${headClass} w-1/2`}>{t('name')}</TableHead>
                  <TableHead className={`${headClass} w-1/4`}>{t('orgManagers')}</TableHead>
                  <TableHead className={`${headClass} w-1/4`}>{t('created')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className='divide-border divide-y'>
                {organizations.map(org => (
                  <TableRow
                    key={org.id}
                    className='cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
                    onClick={() => onSelectOrganization(org.id)}
                  >
                    <TableCell className={cellClass}>
                      <button
                        className='text-primary block max-w-full truncate text-left underline-offset-4 hover:underline'
                        type='button'
                        onClick={e => {
                          e.stopPropagation();
                          onSelectOrganization(org.id);
                        }}
                      >
                        {org.name}
                      </button>
                    </TableCell>
                    <TableCell className={cellClass}>{org.orgManagerCount}</TableCell>
                    <TableCell className={cellClass}>{formatOrgDate(org.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};
