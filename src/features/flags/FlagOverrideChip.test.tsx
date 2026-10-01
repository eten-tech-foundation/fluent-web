import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlagOverrideChip } from './FlagOverrideChip';
import { clearFlagOverrides, refreshFlagOverrides, setFlagOverride } from './flagOverrides';

import type * as ReactRouter from '@tanstack/react-router';

// Decouple from the real router so the chip renders without a RouterProvider
// (same approach as UserHomePage.test.tsx).
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof ReactRouter>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

beforeEach(() => {
  localStorage.clear();
  refreshFlagOverrides();
});

afterEach(() => {
  clearFlagOverrides();
});

describe('FlagOverrideChip', () => {
  it('renders nothing when no override is active', () => {
    render(<FlagOverrideChip />);
    expect(screen.queryByTestId('flag-override-chip')).not.toBeInTheDocument();
  });

  it('appears with a singular label for one override', () => {
    setFlagOverride('repeatedWordCheck', true);
    render(<FlagOverrideChip />);
    expect(screen.getByTestId('flag-override-chip')).toBeInTheDocument();
    expect(screen.getByText('Flag override active (1)')).toBeInTheDocument();
  });

  it('links to the diagnostics page', () => {
    setFlagOverride('repeatedWordCheck', false);
    render(<FlagOverrideChip />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/debug');
  });

  it('clears every override and disappears when ✕ is pressed', async () => {
    const user = userEvent.setup();
    setFlagOverride('repeatedWordCheck', true);
    render(<FlagOverrideChip />);

    await user.click(screen.getByRole('button', { name: 'Reset feature-flag overrides' }));

    expect(screen.queryByTestId('flag-override-chip')).not.toBeInTheDocument();
  });

  it('appears without a reload when an override is set while mounted', async () => {
    render(<FlagOverrideChip />);
    expect(screen.queryByTestId('flag-override-chip')).not.toBeInTheDocument();

    await act(async () => {
      setFlagOverride('repeatedWordCheck', true);
    });

    expect(screen.getByTestId('flag-override-chip')).toBeInTheDocument();
  });
});
