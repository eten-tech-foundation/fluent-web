import { useCallback, useMemo, useState } from 'react';

import { Check, ChevronDown, Loader2, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { UserMultiSelect } from '@/components/UserMultiSelect';
import {
  useAddProjectUsers,
  useProjectUsers,
  useRemoveProjectUser,
  useUpdateProjectUserRole,
  type ProjectUser,
} from '@/features/projects/hooks/useProjectUsers';
import { useCreateUser } from '@/hooks/useUsers';
import {
  getDisplayRole,
  PROJECT_ROLE_OPTIONS,
  UserRole,
  type ChapterAssignmentProgress,
  type User,
} from '@/lib/types';
import { useAppStore } from '@/store/store';

interface AssignProjectUsersProps {
  projectId: number;
  users: User[] | undefined;
  usersLoading: boolean;
  chapterAssignments: ChapterAssignmentProgress[] | undefined;
  isAddUserOpen?: boolean;
  onAddUser?: () => void;
  onCloseAddUser?: () => void;
  referenceHeight?: number;
}

const inviteEmailSchema = z.string().email();
const ALREADY_EXISTS_MESSAGE = 'A user with this email already exists.';

type AddUserTab = 'existing' | 'invite';

export const AssignProjectUsers: React.FC<AssignProjectUsersProps> = ({
  projectId,
  users,
  usersLoading,
  chapterAssignments,
  isAddUserOpen = false,
  onAddUser,
  onCloseAddUser,
  referenceHeight,
}) => {
  const { userdetail } = useAppStore();

  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState<number[]>([]);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<AddUserTab>('existing');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // --- Removal guardrail state ---
  // removeTarget: awaiting confirm/cancel. removeBlockedReason: a blocked
  // removal was attempted, shown until dismissed or another action clears it.
  const [removeTarget, setRemoveTarget] = useState<ProjectUser | null>(null);
  const [removeBlockedReason, setRemoveBlockedReason] = useState<string | null>(null);

  const {
    data: projectUsers,
    isLoading: projectUsersLoading,
    isError: projectUsersError,
    refetch: refetchProjectUsers,
  } = useProjectUsers(projectId, {
    enabled: !!projectId,
  });

  const addProjectUsersMutation = useAddProjectUsers(projectId);
  const removeProjectUserMutation = useRemoveProjectUser(projectId);
  const updateRoleMutation = useUpdateProjectUserRole(projectId);
  const createUserMutation = useCreateUser();

  const assignableRoleOptions = PROJECT_ROLE_OPTIONS;

  const handleRoleChange = useCallback(
    (userId: number, roleId: number) => {
      setEditingUserId(null);
      void updateRoleMutation.mutateAsync({ userId, roleId });
    },
    [updateRoleMutation]
  );

  const availableUsersToAdd = useMemo(() => {
    if (!users || !projectUsers) return users ?? [];
    const projectUserIds = new Set(projectUsers.map(pu => pu.userId));
    return users.filter((u: User) => !projectUserIds.has(u.id));
  }, [users, projectUsers]);

  // --- Invite by Email helpers ---
  const matchedExistingUser = useMemo(() => {
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!trimmed || !users) return null;
    return users.find(u => u.email.toLowerCase() === trimmed) ?? null;
  }, [inviteEmail, users]);

  const isInviteEmailValid = useCallback((email: string): boolean => {
    try {
      inviteEmailSchema.parse(email);
      return true;
    } catch {
      return false;
    }
  }, []);

  const isInviteFormValid = useMemo(() => {
    const trimmedEmail = inviteEmail.trim();
    return (
      Boolean(trimmedEmail) &&
      isInviteEmailValid(trimmedEmail) &&
      Boolean(inviteDisplayName.trim()) &&
      inviteRole !== null &&
      !matchedExistingUser
    );
  }, [inviteEmail, inviteDisplayName, inviteRole, matchedExistingUser, isInviteEmailValid]);

  const handleOpenAddDialog = useCallback(() => {
    setError(null);
    setSelectedUsersToAdd([]);
    setSelectedRole(null);
    setActiveTab('existing');
    setInviteEmail('');
    setInviteDisplayName('');
    setInviteRole(null);
    setInviteError(null);
    onAddUser?.();
  }, [onAddUser]);

  const handleCloseDialog = useCallback(() => {
    setError(null);
    setSelectedUsersToAdd([]);
    setSelectedRole(null);
    setActiveTab('existing');
    setInviteEmail('');
    setInviteDisplayName('');
    setInviteRole(null);
    setInviteError(null);
    onCloseAddUser?.();
  }, [onCloseAddUser]);

  const handleAddProjectUser = useCallback(async () => {
    if (selectedUsersToAdd.length === 0 || selectedRole === null) return;
    setError(null);
    try {
      await addProjectUsersMutation.mutateAsync({
        userIds: selectedUsersToAdd,
        roleId: selectedRole,
      });
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
  }, [selectedUsersToAdd, selectedRole, addProjectUsersMutation, handleCloseDialog]);

  const handleSendInvite = useCallback(async () => {
    if (!isInviteFormValid || inviteRole === null) return;
    setInviteError(null);

    const newUser: Omit<User, 'id'> = {
      email: inviteEmail.trim().toLowerCase(),
      displayName: inviteDisplayName.trim(),
      username: inviteDisplayName.trim(),
      role: inviteRole,
      organization: userdetail?.lastActiveOrgId ?? userdetail?.organization ?? 0,
      createdBy: userdetail?.id ?? 0,
      isActive: true,
      ...({ projectId } as { projectId: number }),
    };

    try {
      await createUserMutation.mutateAsync({ userData: newUser });
      handleCloseDialog();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message === ALREADY_EXISTS_MESSAGE
          ? `${ALREADY_EXISTS_MESSAGE} Use the "Existing User" tab to add them instead.`
          : err instanceof Error
            ? err.message
            : 'Error: User was not invited.';
      setInviteError(message);
    }
  }, [
    isInviteFormValid,
    inviteEmail,
    inviteDisplayName,
    inviteRole,
    projectId,
    userdetail,
    createUserMutation,
    handleCloseDialog,
  ]);

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

  // --- Removal guardrails ---
  const projectManagerCount = useMemo(
    () => (projectUsers ?? []).filter(pu => pu.roleID === UserRole.PROJECT_MANAGER).length,
    [projectUsers]
  );

  // "Active" work = not yet submitted, matching the definition UserHomePage
  // already uses for unsubmitted assignments.
  const getActiveAssignmentCount = useCallback(
    (userId: number) => {
      if (!chapterAssignments) return 0;
      return chapterAssignments.filter(
        a => !a.submittedTime && (a.assignedUser?.id === userId || a.peerChecker?.id === userId)
      ).length;
    },
    [chapterAssignments]
  );

  const handleRequestRemove = useCallback(
    (pu: ProjectUser) => {
      setError(null);

      if (pu.roleID === UserRole.PROJECT_MANAGER && projectManagerCount <= 1) {
        setRemoveTarget(null);
        setRemoveBlockedReason(
          `${pu.displayName} is the only Project Manager on this project. Assign another Project Manager before removing them.`
        );
        return;
      }

      if (getActiveAssignmentCount(pu.userId) > 0) {
        setRemoveTarget(null);
        setRemoveBlockedReason(`${pu.displayName} still has assigned work.`);
        return;
      }

      setRemoveBlockedReason(null);
      setRemoveTarget(pu);
    },
    [projectManagerCount, getActiveAssignmentCount]
  );

  const handleConfirmRemove = useCallback(async () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    await handleRemoveProjectUser(target.userId);
  }, [removeTarget, handleRemoveProjectUser]);

  const renderTableBody = () => {
    if (projectUsersLoading) {
      return (
        <TableRow>
          <TableCell className='py-4 text-center' colSpan={3}>
            <Loader2 className='text-muted-foreground mx-auto h-4 w-4 animate-spin' />
          </TableCell>
        </TableRow>
      );
    }

    if (projectUsersError) {
      return (
        <TableRow>
          <TableCell className='py-4 text-center' colSpan={3}>
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
          <TableCell className='text-muted-foreground py-4 text-center text-sm' colSpan={3}>
            No users added yet
          </TableCell>
        </TableRow>
      );
    }

    return projectUsers.map(pu => {
      const isOwnRow = pu.userId === userdetail?.id;
      const isEditingThisRow = editingUserId === pu.userId;

      return (
        <TableRow key={pu.userId} className='hover:bg-muted/50'>
          <TableCell className='text-foreground py-2.5 pl-3 text-sm'>{pu.displayName}</TableCell>
          <TableCell className='text-foreground relative py-2.5 pr-3 text-sm'>
            {isOwnRow ? (
              <span>{getDisplayRole(pu.roleID)}</span>
            ) : (
              <Popover
                open={isEditingThisRow}
                onOpenChange={open => setEditingUserId(open ? pu.userId : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    className='flex items-center gap-1 rounded-sm text-left hover:opacity-80'
                    type='button'
                  >
                    {getDisplayRole(pu.roleID)}
                    <ChevronDown
                      className={`transition-transform ${isEditingThisRow ? 'rotate-180' : ''}`}
                      size={14}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align='start'
                  className='bg-popover w-44 border-0 p-1.5 shadow-lg'
                  side='bottom'
                  sideOffset={4}
                >
                  {assignableRoleOptions.map(role => {
                    const isSelected = role.value === pu.roleID;
                    return (
                      <button
                        key={role.value}
                        className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-white/60 ${
                          isSelected ? 'font-medium' : ''
                        }`}
                        type='button'
                        onClick={() => handleRoleChange(pu.userId, role.value)}
                      >
                        <span>{role.label}</span>
                        {isSelected && <Check className='text-primary shrink-0' size={14} />}
                      </button>
                    );
                  })}
                </PopoverContent>
              </Popover>
            )}
          </TableCell>
          <TableCell className='py-2.5 pr-3 text-right'>
            {!isOwnRow && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className='h-7 w-7 p-0 hover:text-red-500'
                      disabled={removingUserIds.has(pu.userId)}
                      size='sm'
                      variant='ghost'
                      onClick={() => handleRequestRemove(pu)}
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
            )}
          </TableCell>
        </TableRow>
      );
    });
  };

  const selectedRoleLabel = useMemo(
    () => PROJECT_ROLE_OPTIONS.find(r => r.value === selectedRole)?.label ?? 'Select role',
    [selectedRole]
  );

  const inviteRoleLabel = useMemo(
    () => PROJECT_ROLE_OPTIONS.find(r => r.value === inviteRole)?.label ?? 'Select role',
    [inviteRole]
  );

  return (
    <>
      <div
        className='flex flex-col overflow-hidden rounded-lg border lg:overflow-visible lg:rounded-none lg:border-0'
        style={referenceHeight ? { height: referenceHeight } : undefined}
      >
        {/* Title row */}
        <div className='flex shrink-0 items-center justify-between p-3 pb-3'>
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

        {/* Error banner — fetch failure */}
        {projectUsersError && (
          <div className='mx-3 mb-2 flex shrink-0 items-center gap-1.5 text-sm text-red-500'>
            <TriangleAlert className='h-4 w-4 shrink-0' />
            <span>Error: Loading users failed.</span>
          </div>
        )}

        {/* Generic error banner */}
        {error && (
          <div className='mx-3 mb-2 flex shrink-0 items-center gap-1.5 text-sm text-red-500'>
            <TriangleAlert className='h-4 w-4 shrink-0' />
            <span>{error}</span>
          </div>
        )}

        {/* Remove-confirmation banner — takes priority while active */}
        {removeTarget && (
          <div className='mx-3 mb-2 flex shrink-0 items-center justify-between gap-2 rounded-md bg-red-50 px-3 py-2 dark:bg-red-950/30'>
            <span className='text-sm text-red-700 dark:text-red-400'>
              Remove {removeTarget.displayName} from this project?
            </span>
            <div className='flex shrink-0 gap-2'>
              <Button
                className='h-7 px-2.5 text-xs'
                size='sm'
                variant='outline'
                onClick={() => setRemoveTarget(null)}
              >
                Cancel
              </Button>
              <Button
                className='h-7 bg-red-500 px-2.5 text-xs text-white hover:bg-red-600'
                disabled={removingUserIds.has(removeTarget.userId)}
                size='sm'
                onClick={handleConfirmRemove}
              >
                {removingUserIds.has(removeTarget.userId) ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  'Remove'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Blocked-removal banner */}
        {removeBlockedReason && (
          <div className='mx-3 mb-2 flex shrink-0 items-start justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 dark:bg-amber-950/30'>
            <div className='flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400'>
              <TriangleAlert className='mt-0.5 h-4 w-4 shrink-0' />
              <span>{removeBlockedReason}</span>
            </div>
            <button
              aria-label='Dismiss'
              className='shrink-0 text-amber-700 hover:opacity-70 dark:text-amber-400'
              type='button'
              onClick={() => setRemoveBlockedReason(null)}
            >
              <X className='h-3.5 w-3.5' />
            </button>
          </div>
        )}

        {/* Users table */}
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 border-t lg:mx-3 lg:flex-none lg:rounded-lg lg:border lg:shadow-sm ${
            error || projectUsersError || removeTarget || removeBlockedReason
              ? 'lg:max-h-[165px]'
              : 'lg:max-h-[188px]'
          }`}
        >
          <div className='min-h-0 flex-1 overflow-y-auto lg:rounded-lg'>
            <Table>
              <TableHeader className='sticky top-0 z-10'>
                <TableRow className='hover:bg-transparent'>
                  <TableHead className='py-2 pl-3 text-sm font-semibold'>Name</TableHead>
                  <TableHead className='py-2 pr-3 text-sm font-semibold'>Role</TableHead>
                  <TableHead className='w-10 py-2 pr-3' />
                </TableRow>
              </TableHeader>
              <TableBody className='bg-background'>{renderTableBody()}</TableBody>
            </Table>
          </div>
        </div>
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
        <DialogContent
          className='w-[420px] max-w-[90vw] gap-0 p-0 [&>button]:hidden'
          onInteractOutside={e => e.preventDefault()}
        >
          {/* Header */}
          <div className='flex items-center justify-between px-5 pt-5 pb-3'>
            <h2 className='text-lg font-bold'>Add Project User</h2>
            <button
              aria-label='Close'
              className='text-muted-foreground hover:text-foreground'
              type='button'
              onClick={handleCloseDialog}
            >
              <X className='h-4 w-4' />
            </button>
          </div>

          {/* Tabs header */}
          <div className='border-border flex border-b px-5'>
            <button
              className={`-mb-px border-b-2 px-1 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === 'existing'
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground border-transparent'
              }`}
              type='button'
              onClick={() => setActiveTab('existing')}
            >
              Existing User
            </button>
            <button
              className={`-mb-px ml-6 border-b-2 px-1 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === 'invite'
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground border-transparent'
              }`}
              type='button'
              onClick={() => setActiveTab('invite')}
            >
              Invite by Email
            </button>
          </div>

          {/* --- Existing User tab --- */}
          {activeTab === 'existing' && (
            <div className='flex flex-col gap-6 px-5 pt-5 pb-5'>
              <div className='flex flex-col gap-2'>
                <Label className='gap-1' htmlFor='user-select'>
                  Select User(s)
                </Label>
                <UserMultiSelect
                  isLoading={usersLoading}
                  users={availableUsersToAdd}
                  value={selectedUsersToAdd}
                  onChange={setSelectedUsersToAdd}
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label className='gap-1' htmlFor='role'>
                  Role
                </Label>
                <Select
                  value={selectedRole !== null ? String(selectedRole) : ''}
                  onValueChange={value => setSelectedRole(Number(value) as UserRole)}
                >
                  <SelectTrigger className='w-full bg-white'>
                    <SelectValue placeholder='Select a role'>{selectedRoleLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_ROLE_OPTIONS.map(role => (
                      <SelectItem key={role.value} value={String(role.value)}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='flex justify-end'>
                <Button
                  className='bg-primary text-white'
                  disabled={
                    selectedUsersToAdd.length === 0 ||
                    selectedRole === null ||
                    addProjectUsersMutation.isPending
                  }
                  onClick={handleAddProjectUser}
                >
                  {addProjectUsersMutation.isPending && (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  Save Users
                </Button>
              </div>
            </div>
          )}

          {/* --- Invite by Email tab --- */}
          {activeTab === 'invite' && (
            <div className='flex flex-col gap-6 px-5 pt-5 pb-5'>
              <div className='flex flex-col gap-2'>
                <Label className='gap-1' htmlFor='invite-email'>
                  <span style={{ color: 'red' }}>*</span> Email Address
                </Label>
                <Input
                  className='bg-white'
                  id='invite-email'
                  placeholder='user@example.com'
                  type='email'
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value.toLowerCase())}
                />
                {matchedExistingUser && (
                  <div className='flex items-start gap-1.5 text-sm text-amber-600'>
                    <TriangleAlert className='mt-0.5 h-4 w-4 shrink-0' />
                    <span>
                      This email belongs to an existing org user (
                      {matchedExistingUser.displayName ?? matchedExistingUser.username}). Use the
                      &ldquo;Existing User&rdquo; tab to add them instead.
                    </span>
                  </div>
                )}
              </div>

              <div className='flex flex-col gap-2'>
                <Label className='gap-1' htmlFor='invite-display-name'>
                  <span style={{ color: 'red' }}>*</span> Display Name
                </Label>
                <Input
                  className='bg-white'
                  id='invite-display-name'
                  placeholder='Full Name'
                  value={inviteDisplayName}
                  onChange={e => setInviteDisplayName(e.target.value)}
                />
              </div>

              <div className='flex flex-col gap-2'>
                <Label className='gap-1' htmlFor='invite-role'>
                  <span style={{ color: 'red' }}>*</span> Role
                </Label>
                <Select
                  value={inviteRole !== null ? String(inviteRole) : ''}
                  onValueChange={value => setInviteRole(Number(value) as UserRole)}
                >
                  <SelectTrigger className='w-full bg-white'>
                    <SelectValue placeholder='Select a role'>{inviteRoleLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_ROLE_OPTIONS.map(role => (
                      <SelectItem key={role.value} value={String(role.value)}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {inviteError && (
                <div className='flex items-center gap-1.5 text-sm text-red-500'>
                  <TriangleAlert className='h-4 w-4 shrink-0' />
                  <span>{inviteError}</span>
                </div>
              )}

              <div className='flex justify-end'>
                <Button
                  className='bg-primary text-white'
                  disabled={!isInviteFormValid || createUserMutation.isPending}
                  onClick={handleSendInvite}
                >
                  {createUserMutation.isPending && (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  )}
                  Save Users
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
