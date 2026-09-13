/**
 * Controls tests (§12.1 "Controls" row): accessible names, queue-wide Stop
 * visibility, spinner states, disabled no-text rows, reserved record slot
 * (T4). i18n is mocked to apply defaults deterministically — tests don't
 * boot the app's i18next instance.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TtsVerseControls, type TtsVerseControlsProps } from './TtsVerseControls';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Minimal t(key, defaultValue, options): returns the default with
    // {{placeholders}} interpolated, mirroring i18next's fallback behaviour.
    t: (_key: string, defaultValue: string, options?: Record<string, unknown>) =>
      defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(options?.[name] ?? '')
      ),
  }),
}));

const baseProps: TtsVerseControlsProps = {
  verseRef: 'GEN 1:3',
  hasPlayableText: true,
  isLoading: false,
  isPlaying: false,
  showStop: false,
  onPlayVerse: vi.fn(),
  onPlayFromHere: vi.fn(),
  onPause: vi.fn(),
  onStop: vi.fn(),
};

describe('TtsVerseControls', () => {
  it('renders play and play-from-here with descriptive accessible names (§5.1)', () => {
    const onPlayVerse = vi.fn();
    const onPlayFromHere = vi.fn();
    render(
      <TtsVerseControls {...baseProps} onPlayFromHere={onPlayFromHere} onPlayVerse={onPlayVerse} />
    );

    const play = screen.getByRole('button', { name: 'Play verse GEN 1:3' });
    const playFrom = screen.getByRole('button', { name: 'Play from verse GEN 1:3' });

    fireEvent.click(play);
    fireEvent.click(playFrom);
    expect(onPlayVerse).toHaveBeenCalledTimes(1);
    expect(onPlayFromHere).toHaveBeenCalledTimes(1);
  });

  it('documents the keyboard shortcuts in the button titles (§5.1)', () => {
    render(<TtsVerseControls {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Play verse GEN 1:3' })).toHaveAttribute(
      'title',
      'Play verse GEN 1:3 (Alt+P)'
    );
    expect(screen.getByRole('button', { name: 'Play from verse GEN 1:3' })).toHaveAttribute(
      'title',
      'Play from verse GEN 1:3 (Alt+Shift+P)'
    );
  });

  it('disables both play actions on a row without playable text (§5.1)', () => {
    render(<TtsVerseControls {...baseProps} hasPlayableText={false} />);

    expect(screen.getByRole('button', { name: 'Play verse GEN 1:3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Play from verse GEN 1:3' })).toBeDisabled();
  });

  it('shows a spinner in place of the play icon while this row loads (§5.2)', () => {
    const { rerender } = render(<TtsVerseControls {...baseProps} isLoading />);

    const play = screen.getByRole('button', { name: 'Play verse GEN 1:3' });
    expect(play).toHaveAttribute('aria-busy', 'true');
    expect(play.querySelector('.animate-spin')).not.toBeNull();

    rerender(<TtsVerseControls {...baseProps} isLoading={false} />);
    expect(play).toHaveAttribute('aria-busy', 'false');
    expect(play.querySelector('.animate-spin')).toBeNull();
  });

  it('Stop is rendered only while playback is active — queue-wide, not per-row (§5.1)', () => {
    const onStop = vi.fn();
    const { rerender } = render(<TtsVerseControls {...baseProps} onStop={onStop} />);
    expect(screen.queryByRole('button', { name: 'Stop playback' })).not.toBeInTheDocument();

    rerender(<TtsVerseControls {...baseProps} showStop onStop={onStop} />);
    const stop = screen.getByRole('button', { name: 'Stop playback' });
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('offers a distinct temporary Pause action without repurposing Stop', () => {
    const onPause = vi.fn();
    const onStop = vi.fn();
    const { rerender } = render(
      <TtsVerseControls {...baseProps} onPause={onPause} onStop={onStop} />
    );
    expect(screen.queryByRole('button', { name: 'Pause playback' })).not.toBeInTheDocument();
    rerender(<TtsVerseControls {...baseProps} showStop onPause={onPause} onStop={onStop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause playback' }));
    expect(onPause).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop playback' }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(onPause).toHaveBeenCalledOnce();
  });

  it('reserves the mirrored record slot, empty by default, filled when provided (T4/§5.4)', () => {
    const { rerender } = render(<TtsVerseControls {...baseProps} />);
    const slot = screen.getByTestId('tts-record-slot');
    expect(slot).toBeEmptyDOMElement();

    rerender(<TtsVerseControls {...baseProps} recordSlot={<button>record</button>} />);
    expect(screen.getByRole('button', { name: 'record' })).toBeInTheDocument();
  });
});
