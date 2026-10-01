import { useEffect, useMemo, useState } from 'react';

import { Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getDisplayRole, ROLES } from '@/lib/types';

const emailSchema = z.string().email();

export interface InviteOrgManagerData {
  email: string;
  username: string;
}

interface InviteOrgManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolves on success; rejects on failure so the dialog keeps its values. */
  onInvite: (data: InviteOrgManagerData) => Promise<void>;
  /** Lower-cased emails of everyone already in the org (any status). */
  existingEmails: ReadonlySet<string>;
  error?: string | null;
  isLoading?: boolean;
}

export const InviteOrgManagerModal: React.FC<InviteOrgManagerModalProps> = ({
  isOpen,
  onClose,
  onInvite,
  existingEmails,
  error = null,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setUsername('');
    }
  }, [isOpen]);

  const normalizedEmail = email.trim().toLowerCase();
  const isDuplicate = normalizedEmail !== '' && existingEmails.has(normalizedEmail);
  const isEmailValid = useMemo(
    () => emailSchema.safeParse(normalizedEmail).success,
    [normalizedEmail]
  );
  const isValid = isEmailValid && !isDuplicate && username.trim() !== '';

  const handleSubmit = async (): Promise<void> => {
    if (!isValid) return;
    try {
      await onInvite({ email: normalizedEmail, username: username.trim() });
    } catch {
      // The wrapper surfaces the error via the `error` prop; keep the dialog and values.
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-[500px]' onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('inviteOrgManager')}</DialogTitle>
        </DialogHeader>

        <div className='grid gap-4'>
          <div className='grid gap-3'>
            <Label className='gap-1' htmlFor='inviteEmail'>
              <span style={{ color: 'red' }}>*</span> {t('email')}
            </Label>
            <Input
              className='bg-white'
              id='inviteEmail'
              type='email'
              value={email}
              onChange={e => setEmail(e.target.value.toLowerCase())}
            />
            {isDuplicate && (
              <p className='text-sm font-medium text-red-600' role='alert'>
                {t('personAlreadyInOrganization')}
              </p>
            )}
          </div>

          <div className='grid gap-3'>
            <Label className='gap-1' htmlFor='inviteUsername'>
              <span style={{ color: 'red' }}>*</span> {t('username')}
            </Label>
            <Input
              className='bg-white'
              id='inviteUsername'
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
            <p className='text-xs text-gray-500'>Visible to all Fluent users</p>
          </div>

          <div className='grid gap-3'>
            <Label htmlFor='inviteRole'>{t('role')}</Label>
            <Input
              readOnly
              className='bg-muted'
              id='inviteRole'
              value={getDisplayRole(ROLES.ORG_MANAGER)}
            />
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
            disabled={isLoading || !isValid}
            type='button'
            onClick={handleSubmit}
          >
            {isLoading ? (
              <div className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>Sending...</span>
              </div>
            ) : (
              t('sendInvite')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
