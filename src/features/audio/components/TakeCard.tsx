import React from 'react';

import { Check, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type VerseAudioTake } from '@/lib/types';

import AudioPlayer from './AudioPlayer';

interface SelectAsDraftButtonProps {
  /** Whether the resolve mutation is currently in-flight for this take. */
  isResolving?: boolean;
  /** Whether the action should be disabled (e.g. missing bibleTextId). */
  disabled?: boolean;
  /** Called when the user clicks "Select as Draft". */
  onSelect: () => void;
}

export const SelectAsDraftButton: React.FC<SelectAsDraftButtonProps> = ({
  isResolving = false,
  disabled = false,
  onSelect,
}) => {
  const { t } = useTranslation();

  return (
    <button
      className='mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'
      disabled={isResolving || disabled}
      style={{
        borderColor: 'var(--primary)',
        color: 'var(--primary)',
        backgroundColor: 'transparent',
      }}
      type='button'
      onClick={onSelect}
    >
      <Check className='h-4 w-4' />
      {isResolving ? t('selecting', 'Selecting…') : t('selectAsDraft', 'Select as Draft')}
    </button>
  );
};

interface TakeCardProps {
  take: VerseAudioTake;
  takeNumber: number;
  /** Custom label override, e.g. "Take 1 - Pericope - vv. 1-5" */
  label?: string;
  /** Display name for the uploader. Pass undefined for single-contributor passages. */
  contributorName?: string;
  /** Whether this take is currently marked as the active draft. */
  isActiveDraft: boolean;
  /** Called when this take starts playing. */
  onPlay?: (takeId: number) => void;
  /** Called when this take pauses or finishes playback. */
  onPause?: () => void;
  /** Optional action slot (e.g. SelectAsDraftButton for conflict resolution). */
  action?: React.ReactNode;
}

const TakeCard: React.FC<TakeCardProps> = ({
  take,
  takeNumber,
  label,
  contributorName,
  isActiveDraft,
  onPlay,
  onPause,
  action,
}) => {
  const { t } = useTranslation();
  const recordedDate = new Date(take.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const accentColor = isActiveDraft ? 'var(--success-subtle-foreground)' : 'var(--primary)';

  return (
    <div
      className='rounded-xl border p-4 transition-colors'
      style={{
        backgroundColor: isActiveDraft ? 'var(--success-subtle)' : 'var(--background)',
        borderColor: isActiveDraft ? 'var(--success-subtle-border)' : 'var(--border)',
      }}
    >
      {/* Header row */}
      <div className='mb-1 flex items-center justify-between'>
        <div className='flex flex-col gap-0.5'>
          {contributorName && (
            <div className='text-foreground flex items-center gap-1.5 text-sm font-medium'>
              <User className='text-muted-foreground h-3.5 w-3.5' />
              <span>{contributorName}</span>
            </div>
          )}
          <span className='text-muted-foreground text-xs'>
            {label ? (
              <>
                <span className='text-foreground text-sm font-semibold'>{label}</span>{' '}
              </>
            ) : contributorName ? null : (
              <>
                <span className='text-foreground text-sm font-semibold'>
                  {t('takeNumber', 'Take {{number}}', { number: takeNumber })}
                </span>{' '}
              </>
            )}
            {t('recordedDate', 'Recorded {{date}}', { date: recordedDate })}
          </span>
        </div>

        {isActiveDraft && (
          <span
            className='flex items-center gap-1 text-xs font-semibold'
            style={{ color: 'var(--success-subtle-foreground)' }}
          >
            <svg
              className='h-3.5 w-3.5'
              fill='none'
              stroke='currentColor'
              strokeWidth={2.5}
              viewBox='0 0 24 24'
            >
              <path d='M5 13l4 4L19 7' strokeLinecap='round' strokeLinejoin='round' />
            </svg>
            {t('currentDraft', 'Current Draft')}
          </span>
        )}
      </div>

      {/* Audio player */}
      <AudioPlayer
        accentColor={accentColor}
        initialDuration={take.durationSeconds}
        src={take.downloadUrl}
        onPause={onPause}
        onPlay={onPlay ? () => onPlay(take.id) : undefined}
      />

      {/* Action slot (e.g. Select as Draft button) */}
      {action}
    </div>
  );
};

export default TakeCard;
