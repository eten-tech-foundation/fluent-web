/**
 * Boundary-prompt tests (§12.1 "Queue" row: "chapter-end confirmation/no
 * silent navigation"). The load-bearing assertion is negative: dismissing in
 * any of its three forms must not reach `onContinue`, because `onContinue` is
 * the host's only navigation path (T16).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TtsBoundaryPrompt, type TtsBoundaryPromptProps } from './TtsBoundaryPrompt';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string, options?: Record<string, unknown>) =>
      defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(options?.[name] ?? '')
      ),
  }),
}));

const baseProps: TtsBoundaryPromptProps = {
  open: true,
  nextPageLabel: 'Genesis 2',
  onContinue: vi.fn(),
  onDismiss: vi.fn(),
};

const renderPrompt = (overrides: Partial<TtsBoundaryPromptProps> = {}) => {
  const onContinue = vi.fn();
  const onDismiss = vi.fn();
  render(
    <TtsBoundaryPrompt
      {...baseProps}
      onContinue={onContinue}
      onDismiss={onDismiss}
      {...overrides}
    />
  );
  return { onContinue, onDismiss };
};

describe('TtsBoundaryPrompt', () => {
  it('asks about the page the host named, rather than inventing one', () => {
    renderPrompt();

    expect(screen.getByText('Continue on the next page?')).toBeInTheDocument();
    expect(screen.getByText(/Continue with Genesis 2\?/)).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    renderPrompt({ open: false });

    expect(screen.queryByTestId('tts-boundary-prompt')).not.toBeInTheDocument();
  });

  it('navigates only through confirmation (T16)', () => {
    const { onContinue, onDismiss } = renderPrompt();

    fireEvent.click(screen.getByTestId('tts-boundary-continue'));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('declining stays put', () => {
    const { onContinue, onDismiss } = renderPrompt();

    fireEvent.click(screen.getByTestId('tts-boundary-dismiss'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('Escape stays put — dismissal is never a silent continue', () => {
    const { onContinue, onDismiss } = renderPrompt();

    fireEvent.keyDown(screen.getByTestId('tts-boundary-prompt'), { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('locks both choices while the host is flushing and navigating', () => {
    const { onContinue, onDismiss } = renderPrompt({ isContinuing: true });

    const confirm = screen.getByTestId('tts-boundary-continue');
    const dismiss = screen.getByTestId('tts-boundary-dismiss');
    expect(confirm).toBeDisabled();
    expect(dismiss).toBeDisabled();

    // Double-confirm must not fire a second navigation.
    fireEvent.click(confirm);
    fireEvent.click(dismiss);
    expect(onContinue).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores Escape mid-continue so the in-flight navigation is not cancelled', () => {
    const { onDismiss } = renderPrompt({ isContinuing: true });

    fireEvent.keyDown(screen.getByTestId('tts-boundary-prompt'), { key: 'Escape' });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
