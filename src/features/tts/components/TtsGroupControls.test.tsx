import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => vi.restoreAllMocks());

describe('TtsGroupControls — temporary functional Pause control', () => {
  it('keeps controls visible offline, then re-enables only playable controls on reconnect', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { rerender } = render(<TtsGroupControls {...props()} showStop />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button).toBeVisible();
      expect(button).toBeDisabled();
    }
    online.mockReturnValue(true);
    fireEvent(window, new Event('online'));
    for (const button of buttons) expect(button).toBeEnabled();
    rerender(<TtsGroupControls {...props()} hasPlayableText={false} />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
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
