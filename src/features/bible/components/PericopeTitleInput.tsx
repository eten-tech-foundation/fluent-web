import { useEffect, useState } from 'react';

import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { isValidHeadingText } from '@/features/rte/lib/heading-markers';

interface Props {
  value: string;
  verseNumber: number;
  readOnly: boolean;
  maxHeadingsReached?: boolean;
  onChange: (verseNumber: number, title: string) => void;
  onFocus: () => void;
}

/** The top-level section title stays separate from scripture and other headings. */
export function PericopeTitleInput({
  value,
  verseNumber,
  readOnly,
  maxHeadingsReached = false,
  onChange,
  onFocus,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = draft.trim() !== '' && !isValidHeadingText(draft);
  const id = `pericope-title-${verseNumber}`;
  return (
    <div className='mb-3 space-y-1'>
      <label className='text-muted-foreground text-sm font-medium' htmlFor={id}>
        {t('pericopeSectionTitle', 'Section title')}
      </label>
      <Input
        aria-describedby={invalid || maxHeadingsReached ? `${id}-error` : undefined}
        aria-invalid={invalid || undefined}
        className='bg-transparent font-semibold'
        id={id}
        maxLength={300}
        readOnly={readOnly || maxHeadingsReached}
        value={draft}
        onChange={event => {
          setDraft(event.target.value);
          onChange(verseNumber, event.target.value);
        }}
        onFocus={onFocus}
      />
      {(invalid || maxHeadingsReached) && (
        <p className='text-destructive text-sm' id={`${id}-error`}>
          {maxHeadingsReached
            ? t(
                'headingCountError',
                'Keep at most four headings before a verse to save your changes.'
              )
            : t(
                'pericopeTitleInvalid',
                'Use a single line of up to 300 characters without backslashes.'
              )}
        </p>
      )}
    </div>
  );
}
