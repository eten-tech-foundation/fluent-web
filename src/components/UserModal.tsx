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
import { roleOptions } from '@/lib/constants/roles';
import { Logger } from '@/lib/services/logger';
import { type User } from '@/lib/types';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User | null;
  onSave: (user: User | Omit<User, 'id'>) => Promise<void>;
  error?: string | null;
  mode: 'create' | 'edit';
  isLoading?: boolean;
  disableRoleSelection?: boolean;
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

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && user) {
        const activeGrant =
          user.orgGrants?.find(g => g.orgId === user.lastActiveOrgId) ??
          user.grants?.find(g => g.orgId === user.lastActiveOrgId) ??
          user.orgGrants?.[0] ??
          user.grants?.[0];

        const initialRoleName = activeGrant?.roleName ?? user.role;

        setFormData({
          username: user.username,
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          email: user.email,
          role: initialRoleName,
          status: user.status ?? '',
        });
      } else {
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
  }, [isOpen, user, mode]);

  const emailSchema = z.string().email();

  const isEmailValid = (email: string): boolean => {
    try {
      emailSchema.parse(email);
      return true;
    } catch {
      return false;
    }
  };

  const isFormValid = (): boolean => {
    const hasUsername = Boolean(formData.username.trim());
    const hasValidEmail = Boolean(formData.email.trim()) && isEmailValid(formData.email.trim());
    const hasValidRole = Boolean(
      formData.role && formData.role.trim() !== '' && formData.role !== 'No Role'
    );

    return hasUsername && hasValidEmail && hasValidRole;
  };

  const handleSubmit = async (): Promise<void> => {
    try {
      if (mode === 'edit' && user) {
        await onSave({ ...user, ...formData } as unknown as User);
      } else {
        await onSave(formData as unknown as Omit<User, 'id'>);
      }
    } catch (error) {
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
                {roleOptions.map(option => (
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
