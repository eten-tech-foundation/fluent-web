import { useEffect, useState } from 'react';

import { Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

export const ORG_NAME_MAX_LENGTH = 100;

interface CreateOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolves on success; rejects on failure so the dialog can stay open with the typed value. */
  onSave: (name: string) => Promise<void>;
  error?: string | null;
  isLoading?: boolean;
}

export const CreateOrganizationModal: React.FC<CreateOrganizationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  error = null,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) setName('');
  }, [isOpen]);

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= ORG_NAME_MAX_LENGTH;

  const handleSubmit = async (): Promise<void> => {
    if (!isValid) return;
    try {
      await onSave(trimmed);
    } catch {
      // The wrapper surfaces the error via the `error` prop; keep the dialog and value.
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-[500px]' onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('createOrganization')}</DialogTitle>
        </DialogHeader>

        <div className='grid gap-3'>
          <Label className='gap-1' htmlFor='organizationName'>
            <span style={{ color: 'red' }}>*</span> {t('organizationName')}
          </Label>
          <Input
            className='bg-white'
            id='organizationName'
            maxLength={ORG_NAME_MAX_LENGTH}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void handleSubmit();
            }}
          />
          {error && (
            <div className='flex items-center gap-2'>
              <TriangleAlert className='h-4 w-4 text-red-500' />
              <p className='text-sm font-medium text-red-600'>{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            className='bg-primary hover:bg-primary/90 text-white'
            disabled={isLoading || !isValid}
            type='button'
            onClick={handleSubmit}
          >
            {isLoading ? (
              <div className='flex items-center gap-2'>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>Creating...</span>
              </div>
            ) : (
              t('createOrganization')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
