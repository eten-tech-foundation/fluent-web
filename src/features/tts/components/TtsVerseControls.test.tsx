import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TTS_KEYBOARD_SHORTCUTS } from '../hooks/useTtsKeyboardShortcuts';

import { PlayableControl, type PlayableControlProps } from './TtsVerseControls';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, defaultValue: string) => defaultValue }),
}));

const base: PlayableControlProps = {
  playableKey: 'opaque-content-key',
  label: 'verse GEN 1:3',
  state: 'active',
  canRestart: false,
  badge: false,
  onPrimary: vi.fn(),
  onRestart: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

const primary = () => screen.getByRole('button', { name: /^(Play|Pause) verse/ });
const restart = () => screen.getByRole('button', { name: 'Restart verse GEN 1:3' });

describe('PlayableControl', () => {
  it('uses smaller pericope paint without shrinking its click target or changing the verse variant', () => {
    const h = render(<PlayableControl {...base} badge compact />);
    expect(primary()).toHaveClass('h-10', 'w-10', 'before:inset-y-2', 'before:border');
    expect(primary()).not.toHaveClass('border');
    expect(restart()).toHaveClass(
      'h-10',
      'w-10',
      'before:border',
      'before:border-muted-foreground/60'
    );
    expect(screen.getByRole('img')).toHaveClass('size-2.5');
    h.rerender(<PlayableControl {...base} badge />);
    expect(primary()).toHaveClass('h-10', 'w-10', 'border');
    expect(primary()).not.toHaveClass('before:inset-y-2');
    expect(screen.getByRole('img')).toHaveClass('size-3.5');
  });
  it.each([
    ['active', 'play'],
    ['paused', 'play'],
    ['playing', 'pause'],
    ['offline', 'play-off'],
    ['impossible', 'play-off'],
  ] as const)('renders the %s glyph in the outline primary circle', (state, icon) => {
    render(<PlayableControl {...base} state={state} />);
    expect(primary().querySelector(`.lucide-${icon}`)).not.toBeNull();
    expect(primary()).toHaveClass('rounded-full', 'border');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Play from|Stop/ })).not.toBeInTheDocument();
  });

  it('replaces Play with an animated spinner only in Loading; pressing still cancels via primary', () => {
    const { rerender } = render(<PlayableControl {...base} canRestart state='loading' />);
    expect(primary()).toHaveAttribute('aria-busy', 'true');
    expect(primary().querySelector('.animate-spin')).not.toBeNull();
    expect(primary().querySelector('.lucide-play')).toBeNull();
    fireEvent.click(primary());
    expect(base.onPrimary).toHaveBeenCalledOnce();
    rerender(<PlayableControl {...base} />);
    expect(primary()).toHaveAttribute('aria-busy', 'false');
    expect(primary().querySelector('.animate-spin')).toBeNull();
  });

  it('calls no action on mount or state/badge arrival; no autoplay', () => {
    const { rerender } = render(<PlayableControl {...base} />);
    rerender(<PlayableControl {...base} badge canRestart state='paused' />);
    expect(base.onPrimary).not.toHaveBeenCalled();
    expect(base.onRestart).not.toHaveBeenCalled();
  });

  it('Play and Pause use the same primary entry point, not Restart', () => {
    const { rerender } = render(<PlayableControl {...base} />);
    fireEvent.click(primary());
    rerender(<PlayableControl {...base} canRestart state='playing' />);
    fireEvent.click(primary());
    expect(base.onPrimary).toHaveBeenCalledTimes(2);
    expect(base.onRestart).not.toHaveBeenCalled();
  });

  it('Restart is always present but enabled only when allowed', () => {
    const { rerender } = render(<PlayableControl {...base} />);
    expect(restart()).toBeDisabled();
    fireEvent.click(restart());
    expect(base.onRestart).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    rerender(<PlayableControl {...base} canRestart state='paused' />);
    expect(restart()).toBeEnabled();
    fireEvent.click(restart());
    expect(base.onRestart).toHaveBeenCalledOnce();
  });

  it.each([
    ['offline', "You're offline. Reconnect to play audio."],
    ['impossible', 'TTS is not permitted and no recording is available.'],
  ] as const)(
    '%s primary explains on pointer AND keyboard, while Restart stays inert',
    async (state, reason) => {
      render(<PlayableControl {...base} canRestart impossibleReason={reason} state={state} />);
      expect(primary()).toHaveAttribute('aria-disabled', 'true');
      expect(primary()).not.toHaveAttribute('disabled');
      expect(primary()).toHaveAccessibleDescription(reason);
      expect(restart()).toBeDisabled();
      fireEvent.click(primary());
      const user = userEvent.setup();
      primary().focus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      expect(toastError).toHaveBeenCalledTimes(3);
      expect(toastError).toHaveBeenLastCalledWith(reason);
      expect(base.onPrimary).not.toHaveBeenCalled();
      expect(base.onRestart).not.toHaveBeenCalled();
    }
  );

  it('offline explains offline rather than a supplied licence reason', () => {
    render(<PlayableControl {...base} impossibleReason='Licence barred' state='offline' />);
    fireEvent.click(primary());
    expect(toastError).toHaveBeenCalledWith("You're offline. Reconnect to play audio.");
  });

  it('a missing playable also explains rather than trying playback', () => {
    render(<PlayableControl {...base} disabled />);
    fireEvent.click(primary());
    expect(primary()).toHaveAttribute('aria-disabled', 'true');
    expect(toastError).toHaveBeenCalledWith('Audio is unavailable.');
    expect(base.onPrimary).not.toHaveBeenCalled();
    expect(restart()).toBeDisabled();
  });

  it('hidden reasons are scoped per primary without a duplicate native tooltip', () => {
    render(
      <>
        <PlayableControl {...base} impossibleReason='Reason one' state='impossible' />
        <PlayableControl
          {...base}
          impossibleReason='Reason two'
          label='verse 2'
          state='impossible'
        />
      </>
    );
    const one = screen.getByRole('button', { name: 'Play verse GEN 1:3' });
    const two = screen.getByRole('button', { name: 'Play verse 2' });
    // Select the first explicitly: both controls are present and carry distinct IDs.
    expect(one).not.toHaveAttribute('title');
    expect(two).not.toHaveAttribute('title');
    expect(one).toHaveAccessibleDescription('Reason one');
    expect(two).toHaveAccessibleDescription('Reason two');
    expect(one.getAttribute('aria-describedby')).not.toBe(two.getAttribute('aria-describedby'));
  });

  it('only primary receives the blue AI badge, and the host can clear it', () => {
    const { rerender } = render(<PlayableControl {...base} badge />);
    const badge = screen.getByRole('img', { name: 'AI-generated audio' });
    expect(badge).toHaveClass('text-primary');
    expect(badge.parentElement).toContainElement(primary());
    expect(restart()).not.toContainElement(badge);
    rerender(<PlayableControl {...base} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('focus tooltip and aria-keyshortcuts follow Play/Pause and Restart constants', async () => {
    const { rerender } = render(<PlayableControl {...base} />);
    const user = userEvent.setup();
    await user.tab();
    expect(primary()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      `Play (${TTS_KEYBOARD_SHORTCUTS.playVerse})`
    );
    expect(primary()).toHaveAttribute('aria-keyshortcuts', TTS_KEYBOARD_SHORTCUTS.playVerse);
    expect(primary()).not.toHaveAttribute('title');
    rerender(<PlayableControl {...base} canRestart state='playing' />);
    expect(primary()).toHaveAttribute('aria-keyshortcuts', TTS_KEYBOARD_SHORTCUTS.stop);
    expect(screen.getByRole('tooltip')).toHaveTextContent(`Pause (${TTS_KEYBOARD_SHORTCUTS.stop})`);
    await user.tab();
    expect(restart()).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      `Restart (${TTS_KEYBOARD_SHORTCUTS.restart})`
    );
    expect(restart()).toHaveAttribute('aria-keyshortcuts', TTS_KEYBOARD_SHORTCUTS.restart);
  });
});
