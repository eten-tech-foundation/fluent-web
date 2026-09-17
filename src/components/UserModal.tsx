import { useEffect, useState } from 'react';

import { Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  // DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ORG_INVITE_ROLE_OPTIONS, ORG_ROLE_OPTIONS } from '@/lib/constants/roles';
import { getOrgLevelRoleName } from '@/lib/grant-utils';
import { Logger } from '@/lib/services/logger';
import { ROLES, type User } from '@/lib/types';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
  onSave: (user: User | Omit<User, 'id'>) => Promise<void>;
  error?: string | null;
  mode: 'create' | 'edit';
  isLoading?: boolean;
  disableRoleSelection?: boolean;
  /** Org the role change applies to — used to resolve the edit-mode role. */
  activeOrgId?: number | null;
  /** Lowercased emails of existing org members — blocks duplicate invites. */
  existingEmails?: ReadonlySet<string>;
}

interface FormData {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  disabled?: boolean;
  required?: boolean;
}

export const UserModal: React.FC<UserModalProps> = ({
  isOpen,
  onClose,
  user,
  onSave,
  mode,
  error = null,
  isLoading = false,
  disableRoleSelection = false,
  activeOrgId = null,
  existingEmails,
}) => {
  const { t } = useTranslation();

  const [formData, setFormData] = useState<FormData>({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    role: '',
    status: 'invited',
  });
  const [initialRole, setInitialRole] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && user) {
        // The Users page manages org-level roles only (D1): a project-scoped
        // role like Project Manager is never a dropdown value here. A member
        // with no org-level role is 'Org Member' — selecting it demotes.
        const initialRoleName =
          getOrgLevelRoleName(user.orgGrants ?? user.grants, activeOrgId) ?? ROLES.ORG_MEMBER;

        setInitialRole(initialRoleName);
        setFormData({
          username: user.username,
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          email: user.email,
          role: initialRoleName,
          status: user.status ?? '',
        });
      } else {
        setInitialRole('');
        setFormData({
          username: '',
          firstName: '',
          lastName: '',
          email: '',
          role: '',
          status: 'invited',
        });
      }
    }
  }, [isOpen, user, mode, activeOrgId]);

  const emailSchema = z.string().email();

  const isEmailValid = (email: string): boolean => {
    try {
      emailSchema.parse(email);
      return true;
    } catch {
      return false;
    }
  };

  const isDuplicateEmail =
    mode === 'create' && (existingEmails?.has(formData.email.trim().toLowerCase()) ?? false);

  const isFormValid = (): boolean => {
    const hasUsername = Boolean(formData.username.trim());
    const hasValidEmail = Boolean(formData.email.trim()) && isEmailValid(formData.email.trim());
    const hasValidRole = Boolean(
      formData.role && formData.role.trim() !== '' && formData.role !== 'No Role'
    );

    return hasUsername && hasValidEmail && hasValidRole && !isDuplicateEmail;
  };

  const handleSubmit = async (): Promise<void> => {
    try {
      if (mode === 'edit' && user) {
        await onSave({ ...user, ...formData } as unknown as User);
      } else {
        await onSave(formData as unknown as Omit<User, 'id'>);
      }
    } catch (error) {
      // The dialog stays open; restore the role dropdown to the pre-submit
      // value so a failed role save doesn't appear to have applied.
      if (mode === 'edit') {
        setFormData(prev => ({ ...prev, role: initialRole }));
      }
      Logger.logException(error instanceof Error ? error : new Error(String(error)), {
        source: 'handle user submit',
      });
    }
  };

  const updateFormData = (field: keyof FormData, value: string | number): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const modalTitle = mode === 'create' ? t('addUser') : t('editProfile');
  const submitText = mode === 'create' ? t('addUser') : t('saveUser');
  const isButtonDisabled = isLoading || !isFormValid();
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-[500px]' onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
        </DialogHeader>

        <div className='grid gap-4'>
          <div className='grid gap-3'>
            <Label className='gap-1' htmlFor='email'>
              <span style={{ color: 'red' }}>*</span> {t('email')}
            </Label>
            <Input
              disabled={mode === 'edit'}
              id='email'
              type='email'
              value={formData.email}
              onChange={e => updateFormData('email', e.target.value.toLowerCase())}
            />
            {isDuplicateEmail && (
              <p className='text-sm text-red-600' role='alert'>
                {t('userAlreadyInOrg')}
              </p>
            )}
          </div>

          <div className='grid gap-3'>
            <Label className='gap-1' htmlFor='username'>
              <span style={{ color: 'red' }}>*</span> {t('username')}
            </Label>
            <Input
              className='bg-white'
              id='username'
              value={formData.username}
              onChange={e => updateFormData('username', e.target.value)}
            />
            <p className='text-xs text-gray-500'>Visible to all Fluent users</p>
          </div>

          <div className='grid gap-3'>
            <Label htmlFor='firstName'>{t('firstName')}</Label>
            <Input
              className='bg-white'
              id='firstName'
              value={formData.firstName}
              onChange={e => updateFormData('firstName', e.target.value)}
            />
          </div>

          <div className='grid gap-3'>
            <Label htmlFor='lastName'>{t('lastName')}</Label>
            <Input
              className='bg-white'
              id='lastName'
              value={formData.lastName}
              onChange={e => updateFormData('lastName', e.target.value)}
            />
          </div>

          <div className='disabled grid gap-3'>
            <Label className='gap-1' htmlFor='role'>
              <span style={{ color: 'red' }}>*</span> {t('role')}
            </Label>
            <Select value={formData.role} onValueChange={value => updateFormData('role', value)}>
              <SelectTrigger className='w-full bg-white' disabled={disableRoleSelection}>
                <SelectValue placeholder={mode === 'create' ? 'Select Role' : undefined} />
              </SelectTrigger>
              <SelectContent>
                {(mode === 'edit' ? ORG_ROLE_OPTIONS : ORG_INVITE_ROLE_OPTIONS).map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          {error && (
            <div className='mr-4 flex w-full items-center justify-center gap-2'>
              <TriangleAlert className='h-4 w-4 text-red-500' />
              <p className='text-sm font-medium text-red-600'>{error}</p>
            </div>
          )}
          <Button
            className='bg-primary hover:bg-primary/90 text-white'
            disabled={isButtonDisabled}
            type='button'
            onClick={handleSubmit}
          >
            {isLoading ? (
              <div className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>{mode === 'create' ? 'Creating...' : 'Saving...'}</span>
              </div>
            ) : (
              submitText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
