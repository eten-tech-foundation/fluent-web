import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { elapsedSeconds } from '../lib/barGeometry';

import { TimeReadout } from './TimeReadout';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe('TimeReadout', () => {
  it('renders exact elapsed with an unknown total, without live announcements', () => {
    render(<TimeReadout elapsed={elapsedSeconds(1, 5.5, [60, undefined])} />);
    const timer = screen.getByRole('timer', { name: 'Audio playback time' });
    expect(timer).toHaveTextContent('1:05 / --:--');
    expect(timer).toHaveAttribute('aria-live', 'off');
  });

  it('distinguishes estimated elapsed quietly, then restores normal text when measured', () => {
    const { rerender } = render(<TimeReadout estimated elapsed={32} />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('0:32 / --:--');
    expect(timer).not.toHaveTextContent('≈');
    expect(timer).toHaveClass('text-muted-foreground');
    expect(timer).toHaveAccessibleName('Estimated elapsed audio time');
    expect(timer).toHaveAttribute('aria-live', 'off');
    rerender(<TimeReadout elapsed={35} />);
    expect(timer).toHaveTextContent('0:35 / --:--');
    expect(timer).toHaveClass('text-foreground');
    expect(timer).not.toHaveAttribute('data-estimated');
  });

  it('renders the beginning honestly', () => {
    render(<TimeReadout elapsed={0} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:00 / --:--');
  });
});
