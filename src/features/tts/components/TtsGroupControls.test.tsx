import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TtsGroupControls, type TtsGroupControlsProps } from './TtsGroupControls';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, text: string) => text }),
}));

const props = (): TtsGroupControlsProps => ({
  groupLabel: '1:1–3',
  hasPlayableText: true,
  isLoading: false,
  isPlaying: false,
  showStop: false,
  onPlayGroup: vi.fn(),
  onPlayFromGroup: vi.fn(),
  onPause: vi.fn(),
  onStop: vi.fn(),
});

describe('TtsGroupControls — temporary functional Pause control', () => {
  it('keeps Pause and Stop separate and hides both while idle', () => {
    const callbacks = props();
    const { rerender } = render(<TtsGroupControls {...callbacks} />);
    expect(screen.queryByRole('button', { name: 'Pause playback' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop playback' })).not.toBeInTheDocument();
    rerender(<TtsGroupControls {...callbacks} showStop />);
    const pause = screen.getByRole('button', { name: 'Pause playback' });
    const stop = screen.getByRole('button', { name: 'Stop playback' });
    expect(pause.className).toBe(stop.className);
    fireEvent.click(pause);
    expect(callbacks.onPause).toHaveBeenCalledOnce();
    expect(callbacks.onStop).not.toHaveBeenCalled();
    fireEvent.click(stop);
    expect(callbacks.onPause).toHaveBeenCalledOnce();
    expect(callbacks.onStop).toHaveBeenCalledOnce();
  });
});
