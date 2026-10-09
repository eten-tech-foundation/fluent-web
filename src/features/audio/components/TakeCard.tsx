import React from 'react';

import { Check, User } from 'lucide-react';

import { type VerseAudioTake } from '@/lib/types';

import AudioPlayer from './AudioPlayer';

interface TakeCardProps {
  take: VerseAudioTake;
  takeNumber: number;
  /** Display name for the uploader. Pass undefined for single-contributor passages. */
  contributorName?: string;
  isActiveDraft: boolean;
  /** Whether this take is currently being played. */
  isPlaying: boolean;
  onPlay: (takeId: number) => void;
  /** Whether another take is playing (signals this card to pause). */
  shouldPause: boolean;
  /** When true, show the "Select as Draft" button. Only shown in conflict passages. */
  isConflict?: boolean;
  /** When true, the current user is a PM and may resolve conflicts. */
  isPM?: boolean;
  /** Called when the PM clicks "Select as Draft". */
  onSelectAsDraft?: (takeId: number) => void;
  /** Whether the resolve mutation is currently in-flight for this take. */
  isResolving?: boolean;
}

const TakeCard: React.FC<TakeCardProps> = ({
  take,
  takeNumber,
  contributorName,
  isActiveDraft,
  onPlay,
  shouldPause,
  isConflict = false,
  isPM = false,
  onSelectAsDraft,
  isResolving = false,
}) => {
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
            {contributorName ? null : (
              <span className='text-foreground text-sm font-semibold'>Take {takeNumber}&nbsp;</span>
            )}
            Recorded {recordedDate}
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
            Current Draft
          </span>
        )}
      </div>

      {/* Audio player */}
      <AudioPlayer
        accentColor={accentColor}
        initialDuration={take.durationSeconds}
        shouldPause={shouldPause}
        src={take.downloadUrl}
        onPlay={() => onPlay(take.id)}
      />

      {/* Select as Draft — only visible to PMs on conflict passages; hidden once resolved */}
      {isConflict && isPM && !isActiveDraft && (
        <button
          className='mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'
          disabled={isResolving}
          style={{
            borderColor: 'var(--primary)',
            color: 'var(--primary)',
            backgroundColor: 'transparent',
          }}
          type='button'
          onClick={() => onSelectAsDraft?.(take.id)}
        >
          <Check className='h-4 w-4' />
          {isResolving ? 'Selecting…' : 'Select as Draft'}
        </button>
      )}
    </div>
  );
};

export default TakeCard;
