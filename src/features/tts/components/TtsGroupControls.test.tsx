import { useLayoutEffect } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type PericopePlaybackView } from '../hooks/useSourceTtsPlayback';
import { PlaybackRegistryProvider } from '../registry/PlaybackRegistryProvider';

import { PericopePlayer, type PericopePlayerProps } from './TtsGroupControls';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, text: string, args?: Record<string, string>) =>
      text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => args?.[key] ?? ''),
  }),
}));
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => {
      toastError(...args);
    },
  },
}));

const model = (): PericopePlaybackView => ({
  key: 'group',
  isLive: false,
  staticAi: false,
  dynamicAi: false,
  segments: [
    { verseRef: '1', text: 'First', durationSeconds: 10, epoch: 1 },
    { verseRef: '2', text: 'Second text', durationSeconds: null, epoch: 1 },
  ],
  currentIndex: 0,
  currentTime: 0,
});
const props = (view = model()): PericopePlayerProps => ({
  groupLabel: '1:1–2',
  verseRefs: ['1', '2'],
  playback: {
    status: 'idle',
    groupView: () => view,
    playGroup: vi.fn(),
    restartGroup: vi.fn(),
    seekGroup: vi.fn(),
    showRecordedNotice: vi.fn(),
  },
});
const mount = (input: PericopePlayerProps) =>
  render(<PericopePlayer {...input} />, { wrapper: PlaybackRegistryProvider });
afterEach(() => {
  vi.restoreAllMocks();
  toastError.mockClear();
});

describe('PericopePlayer', () => {
  it('renders each new playhead in the same frame, with no stale effect-driven position', () => {
    const view: PericopePlaybackView = {
      ...model(),
      segments: [{ verseRef: '1', text: 'first', durationSeconds: 10, epoch: 1 }],
      currentTime: 0,
    };
    const input = props(view);
    const frames: string[] = [];
    function Observe() {
      useLayoutEffect(() => {
        const value = screen.getByRole('slider', { hidden: true }).getAttribute('aria-valuenow');
        if (value !== null) frames.push(value);
      });
      return <PericopePlayer {...input} />;
    }
    const h = render(<Observe />, { wrapper: PlaybackRegistryProvider });
    frames.length = 0;
    view.currentTime = 2;
    h.rerender(<Observe />);
    view.pendingFraction = 0.75;
    h.rerender(<Observe />);
    view.pendingFraction = undefined;
    view.currentTime = 7.5;
    h.rerender(<Observe />);
    expect(frames).toEqual(['0.2', '0.75', '0.75']);
  });

  it('re-reads changed segment topology and seeks by verse identity, not a stale displayed index', () => {
    const view = model();
    const input = props(view);
    const h = mount(input);
    view.segments = [view.segments[1]];
    h.rerender(<PericopePlayer {...input} />);
    expect(screen.queryByTestId('audio-segment-boundary')).not.toBeInTheDocument();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuetext', '2');
    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.keyUp(slider, { key: 'Home' });
    expect(input.playback.seekGroup).toHaveBeenCalledExactlyOnceWith(['1', '2'], '2', 0);
  });
  it('is passive on mount, with a shared primary, disabled Restart, bar and exact zero readout', () => {
    const input = props();
    mount(input);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '1');
    expect(screen.getByRole('timer')).toHaveTextContent('0:00 / --:--');
    expect(screen.getByRole('button', { name: /^Restart/ })).toBeDisabled();
    expect(input.playback.playGroup).not.toHaveBeenCalled();
    expect(input.playback.seekGroup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Play/ }));
    expect(input.playback.playGroup).toHaveBeenCalledWith(['1', '2']);
  });

  it('offers recording Info only for a retained fresh notice', () => {
    const view: PericopePlaybackView = {
      ...model(),
      recordedNotice: {
        textBibleKey: 'dbl-text',
        textBibleName: 'Text Bible',
        recordingKey: 'aq-1',
        recordingName: 'Recording Bible',
        recordingProvider: 'aquifer' as const,
        notice: 'Curated notice',
      },
    };
    const input = props(view);
    const h = mount(input);
    fireEvent.click(screen.getByRole('button', { name: 'Recording information for 1:1–2' }));
    expect(input.playback.showRecordedNotice).toHaveBeenCalledWith(view.recordedNotice);
    view.recordedNotice = null;
    h.rerender(<PericopePlayer {...input} />);
    expect(
      screen.queryByRole('button', { name: 'Recording information for 1:1–2' })
    ).not.toBeInTheDocument();
  });

  it('maps live playback, provenance and elapsed independently of the idle registry', () => {
    const view = { ...model(), isLive: true, dynamicAi: true, currentIndex: 1, currentTime: 2 };
    const input = props(view);
    input.playback.status = 'playing';
    const h = mount(input);
    expect(screen.getByRole('button', { name: /^Pause/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Restart/ })).toBeEnabled();
    expect(screen.getByRole('img')).toHaveAccessibleName('AI-generated audio');
    expect(screen.getByRole('timer')).toHaveTextContent('0:12 / --:--');
    const before = screen.getByRole('slider').getAttribute('aria-valuenow');
    view.segments = view.segments.map((segment, index) =>
      index === 1 ? { ...segment, durationSeconds: 20 } : segment
    );
    h.rerender(<PericopePlayer {...input} />);
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).not.toBe(before);
    expect(screen.getAllByTestId('audio-segment-boundary')).toHaveLength(1);
  });

  it('shows subtly muted estimated elapsed after a seek across an unmeasured verse', () => {
    const view = model();
    view.currentIndex = 1;
    view.currentTime = 2;
    view.segments[0].durationSeconds = null;
    mount(props(view));
    expect(screen.getByRole('timer')).toHaveTextContent('0:02 / --:--');
    expect(screen.getByRole('timer')).toHaveAttribute('data-estimated', 'true');
    expect(screen.getByRole('timer')).toHaveAccessibleName('Estimated elapsed audio time');
    expect(screen.getByRole('timer')).toHaveClass('text-muted-foreground');
  });

  it('keeps the primary pressable for its offline reason, Restart disabled and the bar inert', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const input = props();
    mount(input);
    const primary = screen.getByRole('button', { name: /^Play/ });
    expect(primary).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(primary);
    expect(toastError).toHaveBeenCalledWith("You're offline. Reconnect to play audio.");
    expect(input.playback.playGroup).not.toHaveBeenCalled();
    const slider = screen.getByRole('slider');
    expect(slider).not.toHaveAttribute('tabindex');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    expect(input.playback.seekGroup).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(primary).not.toHaveAttribute('aria-disabled');
    expect(slider).toHaveAttribute('tabindex', '0');
  });
});
