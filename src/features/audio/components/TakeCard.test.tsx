import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackRegistryProvider } from '@/features/tts';
import { type VerseAudioTake } from '@/lib/types';

import TakeCard, { SelectAsDraftButton } from './TakeCard';

vi.mock('react-i18next', () => import('@/test/i18n'));

const mockTake: VerseAudioTake = {
  id: 1,
  uploadedBy: 10,
  contentType: 'audio/webm',
  sizeBytes: 1024,
  durationSeconds: 15,
  contentHash: 'hash-1',
  downloadUrl: 'https://example.com/take-1.webm',
  createdAt: '2026-03-15T12:00:00Z',
  updatedAt: '2026-03-15T12:00:00Z',
};

describe('TakeCard', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('renders take number and recorded date for single contributor', () => {
    render(
      <PlaybackRegistryProvider>
        <TakeCard isActiveDraft={false} take={mockTake} takeNumber={1} />
      </PlaybackRegistryProvider>
    );

    expect(screen.getByText(/Take 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Recorded.*2026/i)).toBeInTheDocument();
  });

  it('renders contributor name when provided', () => {
    render(
      <PlaybackRegistryProvider>
        <TakeCard contributorName='Alice' isActiveDraft={false} take={mockTake} takeNumber={1} />
      </PlaybackRegistryProvider>
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders Current Draft badge when isActiveDraft is true', () => {
    render(
      <PlaybackRegistryProvider>
        <TakeCard isActiveDraft={true} take={mockTake} takeNumber={1} />
      </PlaybackRegistryProvider>
    );

    expect(screen.getByText('Current Draft')).toBeInTheDocument();
  });

  it('renders action slot when provided', () => {
    render(
      <PlaybackRegistryProvider>
        <TakeCard
          action={<button type='button'>Custom Action</button>}
          isActiveDraft={false}
          take={mockTake}
          takeNumber={1}
        />
      </PlaybackRegistryProvider>
    );

    expect(screen.getByRole('button', { name: 'Custom Action' })).toBeInTheDocument();
  });
});

describe('SelectAsDraftButton', () => {
  it('renders button and handles onSelect click', () => {
    const onSelect = vi.fn();
    render(<SelectAsDraftButton onSelect={onSelect} />);

    const button = screen.getByRole('button', { name: /Select as Draft/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('disables and shows Selecting… when isResolving is true', () => {
    render(<SelectAsDraftButton isResolving={true} onSelect={vi.fn()} />);

    const button = screen.getByRole('button', { name: /Selecting…/i });
    expect(button).toBeDisabled();
  });

  it('disables when disabled is true', () => {
    render(<SelectAsDraftButton disabled={true} onSelect={vi.fn()} />);

    const button = screen.getByRole('button', { name: /Select as Draft/i });
    expect(button).toBeDisabled();
  });
});
