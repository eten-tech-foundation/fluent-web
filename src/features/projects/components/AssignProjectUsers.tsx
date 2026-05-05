import { useCallback, useMemo, useState } from 'react';

import { Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { UserMultiSelect } from '@/components/UserMultiSelect';
import {
  useAddProjectUsers,
  useProjectUsers,
  useRemoveProjectUser,
} from '@/features/projects/hooks/useProjectUsers';
import { type User } from '@/lib/types';

interface AssignProjectUsersProps {
  projectId: number;
  email: string;
  users: User[] | undefined;
  usersLoading: boolean;
  isAddUserOpen?: boolean;
  onAddUser?: () => void;
  onCloseAddUser?: () => void;
}

export const AssignProjectUsers: React.FC<AssignProjectUsersProps> = ({
  projectId,
  email,
  users,
  usersLoading,
  isAddUserOpen = false,
  onAddUser,
  onCloseAddUser,
}) => {
  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    data: projectUsers,
    isLoading: projectUsersLoading,
    isError: projectUsersError,
    refetch: refetchProjectUsers,
  } = useProjectUsers(projectId, email, {
    enabled: !!projectId && !!email,
  });

  const addProjectUsersMutation = useAddProjectUsers(projectId, email);
  const removeProjectUserMutation = useRemoveProjectUser(projectId, email);

  const availableUsersToAdd = useMemo(() => {
    if (!users || !projectUsers) return users ?? [];
    const projectUserIds = new Set(projectUsers.map(pu => pu.userId));
    return users.filter((u: User) => !projectUserIds.has(u.id));
  }, [users, projectUsers]);

  const handleOpenAddDialog = useCallback(() => {
    setError(null);
    setSelectedUsersToAdd([]);
    onAddUser?.();
  }, [onAddUser]);

  const handleCloseDialog = useCallback(() => {
    setError(null);
    setSelectedUsersToAdd([]);
    onCloseAddUser?.();
  }, [onCloseAddUser]);

  const handleAddProjectUser = useCallback(async () => {
    if (selectedUsersToAdd.length === 0) return;
    setError(null);
    try {
      await addProjectUsersMutation.mutateAsync({ userIds: selectedUsersToAdd });
      handleCloseDialog();
    } catch (err: unknown) {
      const message =
        err instanceof TypeError && err.message === 'Failed to fetch'
          ? 'Error: Users not added.'
          : err instanceof Error
            ? err.message
            : 'Error: Users not added.';
      setError(message);
    }
  }, [selectedUsersToAdd, addProjectUsersMutation, handleCloseDialog]);

  const [removingUserIds, setRemovingUserIds] = useState<Set<number>>(new Set());

  const handleRemoveProjectUser = useCallback(
    async (userId: number) => {
      setError(null);
      setRemovingUserIds(prev => new Set(prev).add(userId));
      try {
        await removeProjectUserMutation.mutateAsync({ userId });
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.message.includes('User has content')
            ? 'Error: User still has assigned content.'
            : 'Error: User not removed.';
        setError(message);
      } finally {
        setRemovingUserIds(prev => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    },
    [removeProjectUserMutation]
  );

  const renderTableBody = () => {
    if (projectUsersLoading) {
      return (
        <TableRow>
          <TableCell className='py-4 text-center' colSpan={2}>
            <Loader2 className='text-muted-foreground mx-auto h-4 w-4 animate-spin' />
          </TableCell>
        </TableRow>
      );
    }

    if (projectUsersError) {
      return (
        <TableRow>
          <TableCell className='py-4 text-center' colSpan={2}>
            <Button
              className='bg-primary text-white'
              size='sm'
              onClick={() => void refetchProjectUsers()}
            >
              Reload Users
            </Button>
          </TableCell>
        </TableRow>
      );
    }

    if (!projectUsers?.length) {
      return (
        <TableRow>
          <TableCell className='text-muted-foreground py-4 text-center text-sm' colSpan={2}>
            No users added yet
          </TableCell>
        </TableRow>
      );
    }

    return projectUsers.map(pu => (
      <TableRow key={pu.userId} className='hover:bg-muted/50'>
        <TableCell className='text-foreground py-2.5 pl-3 text-sm'>{pu.displayName}</TableCell>
        <TableCell className='py-2.5 pr-3 text-right'>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className='h-7 w-7 p-0 hover:text-red-500'
                  disabled={removingUserIds.has(pu.userId)}
                  size='sm'
                  variant='ghost'
                  onClick={() => handleRemoveProjectUser(pu.userId)}
                >
                  {removingUserIds.has(pu.userId) ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    <Trash2 className='h-4 w-4' />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>Remove user from project</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
      </TableRow>
    ));
  };

  return (
    <>
      <div className='flex flex-col'>
        {/* Title row */}
        <div className='mb-3 flex items-center justify-between'>
          <h3 className='text-lg font-bold'>Project Users</h3>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className='bg-primary h-8 w-8 rounded-sm p-0 text-white'
                  size='sm'
                  onClick={handleOpenAddDialog}
                >
                  <Plus className='h-4 w-4' strokeWidth={2} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>Add user to project</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/*Error banner — only shown when the fetch itself failed */}
        {projectUsersError && (
          <div className='mb-2 flex items-center gap-1.5 text-sm text-red-500'>
            <TriangleAlert className='h-4 w-4 shrink-0' />
            <span>Error: Loading users failed.</span>
          </div>
        )}

        {error && (
          <div className='mb-2 flex items-center gap-1.5 text-sm text-red-500'>
            <TriangleAlert className='h-4 w-4 shrink-0' />
            <span>{error}</span>
          </div>
        )}

        {/* Users table */}
        <Card>
          <CardContent className='p-0'>
            <div
              className={`overflow-y-auto rounded-lg ${error || projectUsersError ? 'max-h-[165px]' : 'max-h-[188px]'}`}
            >
              <Table>
                <TableHeader className='sticky top-0 z-10'>
                  <TableRow className='hover:bg-transparent'>
                    <TableHead className='py-2 pl-3 text-sm font-semibold'>Name</TableHead>
                    <TableHead className='w-10 py-2 pr-3' />
                  </TableRow>
                </TableHeader>
                <TableBody className='bg-background'>{renderTableBody()}</TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Project User Dialog */}
      <Dialog
        open={isAddUserOpen}
        onOpenChange={open => {
          if (!open && isAddUserOpen) {
            handleCloseDialog();
          }
        }}
      >
        <DialogContent className='w-[420px] max-w-[90vw]'>
          <DialogHeader>
            <DialogTitle>Add Project User</DialogTitle>
          </DialogHeader>
          <div className='flex flex-col gap-6 pt-2'>
            <UserMultiSelect
              isLoading={usersLoading}
              users={availableUsersToAdd}
              value={selectedUsersToAdd}
              onChange={setSelectedUsersToAdd}
            />

            <div className='flex justify-end'>
              <Button
                className='bg-primary text-white'
                disabled={selectedUsersToAdd.length === 0 || addProjectUsersMutation.isPending}
                onClick={handleAddProjectUser}
              >
                {addProjectUsersMutation.isPending && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                Save Users
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
