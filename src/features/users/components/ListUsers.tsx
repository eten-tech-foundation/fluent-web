import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Loader2, Trash2 } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getOrgRoleName } from '@/lib/grant-utils';
import { getDisplayRole, type User } from '@/lib/types';

interface UsersPageProps {
  users: User[];
  loading?: boolean;
  onAddUser: () => void;
  onEditUser: (user: User) => void;
  /** Org whose roles are being displayed — drives the D3 role column. */
  activeOrgId?: number | null;
  /** Email of the signed-in user; their row hides the remove action (D2). */
  currentUserEmail?: string;
  onRemoveUser?: (user: User) => void;
  /** Slot rendered above the table (e.g. the remove-confirmation banner). */
  banner?: React.ReactNode;
}

const TruncatedTextCell = ({
  text,
  align = 'start',
}: {
  text: string;
  align?: 'center' | 'end' | 'start';
}) => {
  const textRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
      }
    };
    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [text]);

  const content = (
    <div ref={textRef} className='truncate' title=''>
      {text}
    </div>
  );

  if (!isTruncated) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div ref={textRef} className='truncate'>
          {text}
        </div>
      </TooltipTrigger>
      <TooltipContent
        align={align}
        className='bg-popover text-popover-foreground border-border rounded-md border px-4 py-2.5 text-sm font-semibold whitespace-nowrap shadow-lg'
        side='top'
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
};
// -----------------------------------------------------------

export const UsersPage: React.FC<UsersPageProps> = ({
  loading,
  users,
  onAddUser,
  onEditUser,
  activeOrgId = null,
  currentUserEmail,
  onRemoveUser,
  banner,
}) => {
  const { t } = useTranslation();

  const getStatusVariant = (status: 'invited' | 'verified') => {
    return status === 'invited' ? 'primary' : 'accent';
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.username.localeCompare(b.username));
  }, [users]);

  const showActions = Boolean(onRemoveUser);

  return (
    <div className='flex h-full flex-col'>
      <div className='mb-6 shrink-0'>
        <h1 className='text-foreground mb-4 text-3xl font-semibold'>{t('users')}</h1>
        <Button className='bg-primary hover:bg-primary/90 text-white' onClick={onAddUser}>
          {t(`addUser`)}
        </Button>
      </div>

      {banner}

      <div className='flex flex-1 flex-col overflow-hidden rounded-lg border shadow'>
        {loading ? (
          <div className='flex items-center justify-center gap-2 py-8'>
            <Loader2 className='h-5 w-5 animate-spin' />
            <span>Loading...</span>
          </div>
        ) : sortedUsers.length === 0 ? (
          <div className='flex items-center justify-center py-8'>
            <span>No Users Found</span>
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className='flex h-full flex-col overflow-y-auto'>
              <Table className='table-fixed'>
                <TableHeader className='sticky top-0 z-10'>
                  <TableRow className='bg-accent'>
                    <TableHead className='text-accent-foreground px-6 py-3 text-left text-sm font-semibold tracking-wider'>
                      {t(`name`)}
                    </TableHead>
                    <TableHead className='text-accent-foreground px-6 py-3 text-left text-sm font-semibold tracking-wider'>
                      {t(`role`)}
                    </TableHead>
                    <TableHead className='text-accent-foreground px-6 py-3 text-left text-sm font-semibold tracking-wider'>
                      {t(`email`)}
                    </TableHead>
                    <TableHead className='text-accent-foreground px-6 py-3 text-left text-sm font-semibold tracking-wider'>
                      {t(`status`)}
                    </TableHead>
                    {showActions && <TableHead className='w-14 px-3 py-3' />}
                  </TableRow>
                </TableHeader>
                <TableBody className='divide-border divide-y'>
                  {sortedUsers.map(user => (
                    <TableRow
                      key={user.id}
                      className='cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800'
                      onClick={() => onEditUser(user)}
                    >
                      <TableCell className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'>
                        <TruncatedTextCell text={user.username} />
                      </TableCell>
                      <TableCell className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'>
                        {getDisplayRole(
                          getOrgRoleName(user.orgGrants ?? user.grants, activeOrgId) ?? 'No Role'
                        )}
                      </TableCell>
                      <TableCell className='text-popover-foreground px-6 py-4 text-sm whitespace-nowrap'>
                        <TruncatedTextCell align='center' text={user.email} />
                      </TableCell>
                      <TableCell className='px-6 py-4 whitespace-nowrap'>
                        <Badge variant={getStatusVariant(user.status as 'invited' | 'verified')}>
                          {user.status}
                        </Badge>
                      </TableCell>
                      {showActions && (
                        <TableCell className='px-3 py-4 whitespace-nowrap'>
                          {user.email !== currentUserEmail && (
                            <button
                              aria-label={t('removeUserFromOrg')}
                              className='text-muted-foreground hover:text-destructive cursor-pointer rounded p-1 transition-colors'
                              type='button'
                              onClick={e => {
                                e.stopPropagation();
                                onRemoveUser?.(user);
                              }}
                            >
                              <Trash2 className='h-4 w-4' />
                            </button>
                          )}
                        </TableCell>
                      )}
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
