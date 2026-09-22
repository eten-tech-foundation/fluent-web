import { Loader2 } from 'lucide-react';
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
import { ViewPageHeader } from '@/features/projects/components/ViewPageHeader';
import { getOrgRoleName } from '@/lib/grant-utils';
import { getDisplayRole, type OrganizationSummary, type User } from '@/lib/types';

import { formatOrgDate } from './formatOrgDate';

interface OrganizationDetailPageProps {
  organization: OrganizationSummary | undefined;
  members: User[];
  loading?: boolean;
  onBack: () => void;
  onInviteOrgManager: () => void;
}

const headClass =
  'text-accent-foreground w-1/4 px-6 py-3 text-left text-sm font-semibold tracking-wider';
const cellClass = 'text-popover-foreground px-6 py-4 text-sm whitespace-nowrap';

export const OrganizationDetailPage: React.FC<OrganizationDetailPageProps> = ({
  organization,
  members,
  loading,
  onBack,
  onInviteOrgManager,
}) => {
  const { t } = useTranslation();

  const sortedMembers = [...members].sort((a, b) => a.username.localeCompare(b.username));

  return (
    <div className='flex h-full flex-col'>
      <ViewPageHeader
        rightContent={
          <Button
            className='bg-primary hover:bg-primary/90 text-white'
            disabled={!organization}
            onClick={onInviteOrgManager}
          >
            {t('inviteOrgManager')}
          </Button>
        }
        title={organization?.name ?? ''}
        onBack={onBack}
      />
      {organization?.createdAt && (
        <p className='text-muted-foreground mb-4 text-sm'>
          {t('created')}: {formatOrgDate(organization.createdAt)}
        </p>
      )}

      <div className='flex flex-1 flex-col overflow-hidden rounded-lg border shadow'>
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
    </div>
  );
};
