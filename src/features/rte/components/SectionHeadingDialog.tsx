import { useState } from 'react';

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { isValidHeadingText } from '../lib/heading-markers';

interface SectionHeadingDialogProps {
  verseNumber: number;
  onAdd: (text: string) => void;
  onClose: () => void;
}

/** Collect heading words before inserting: an empty heading cannot be saved by the API. */
export function SectionHeadingDialog({ verseNumber, onAdd, onClose }: SectionHeadingDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const invalid = Boolean(text.trim()) && !isValidHeadingText(text);

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <form
          className='grid gap-4'
          onSubmit={event => {
            event.preventDefault();
            if (text.trim() && !invalid) onAdd(text.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('blockSectionHeading', 'Section Heading')}</DialogTitle>
            <DialogDescription>
              {t('headingBeforeVerse', {
                defaultValue: 'Before verse {{verseNumber}}',
                verseNumber,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='section-heading-text'>{t('headingText', 'Heading text')}</Label>
            <Input
              aria-invalid={invalid}
              id='section-heading-text'
              maxLength={300}
              value={text}
              onChange={event => setText(event.target.value)}
            />
            {invalid && (
              <p className='text-destructive text-sm' role='alert'>
                {t(
                  'headingInvalidText',
                  'Use up to 300 characters without backslashes or line breaks.'
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {t('cancel', 'Cancel')}
            </Button>
            <Button disabled={!text.trim() || invalid} type='submit'>
              {t('addHeading', 'Add heading')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
