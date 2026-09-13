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

  it('shows unknown elapsed after a forward seek and recovers when it becomes measurable', () => {
    const { rerender } = render(
      <TimeReadout elapsed={elapsedSeconds(2, 5, [10, undefined, undefined])} />
    );
    expect(screen.getByRole('timer')).toHaveTextContent('--:-- / --:--');
    rerender(<TimeReadout elapsed={elapsedSeconds(2, 5, [10, 20, undefined])} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:35 / --:--');
  });

  it('renders the beginning honestly', () => {
    render(<TimeReadout elapsed={0} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:00 / --:--');
  });
});
