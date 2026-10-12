import { type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient, render, screen, waitFor } from '@/test/render';

import { FeatureFlagsDiagnostics } from './FeatureFlagsDiagnostics';
import {
  clearFlagOverrides,
  readFlagOverrides,
  refreshFlagOverrides,
  setFlagOverride,
} from './flagOverrides';

const FEATURES_URL = `${config.api.url}/config/features`;

const makeWrapper = () => {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const mockFeatures = (features: Record<string, boolean>, status = 200) =>
  server.use(http.get(FEATURES_URL, () => HttpResponse.json({ features }, { status })));

beforeEach(() => {
  localStorage.clear();
  refreshFlagOverrides();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearFlagOverrides();
});

describe('FeatureFlagsDiagnostics', () => {
  it('renders each flag with its published On/Off state once loaded', async () => {
    mockFeatures({ repeatedWordCheck: true });
    render(<FeatureFlagsDiagnostics />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('flag-state-repeatedWordCheck')).toHaveTextContent('On')
    );
    expect(screen.getByTestId('flag-row-repeatedWordCheck')).toBeInTheDocument();
    expect(screen.queryByTestId('flags-error')).not.toBeInTheDocument();
  });

  it('shows the flag as Off when the API reports it off', async () => {
    mockFeatures({ repeatedWordCheck: false });
    render(<FeatureFlagsDiagnostics />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('flag-state-repeatedWordCheck')).toHaveTextContent('Off')
    );
  });

  it('surfaces an error banner and fail-closed (Off) values when the endpoint errors', async () => {
    mockFeatures({ repeatedWordCheck: true }, 500);
    render(<FeatureFlagsDiagnostics />, { wrapper: makeWrapper() });

    await waitFor(() => expect(screen.getByTestId('flags-error')).toBeInTheDocument());
    // Even though the (failing) server would have said `true`, the page shows Off.
    expect(screen.getByTestId('flag-state-repeatedWordCheck')).toHaveTextContent('Off');
  });

  it('reflects the flag map even for an unknown/new flag key (enumerates the map)', async () => {
    // The API is the source of truth; a flag added there before the FeatureName
    // union is updated should still render, proving the page is data-driven.
    mockFeatures({ repeatedWordCheck: false, someNewFlag: true });
    render(<FeatureFlagsDiagnostics />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('flag-state-someNewFlag')).toHaveTextContent('On')
    );
  });

  it('refetches when Refresh is clicked', async () => {
    let calls = 0;
    server.use(
      http.get(FEATURES_URL, () => {
        calls += 1;
        return HttpResponse.json({ features: { repeatedWordCheck: false } });
      })
    );
    const user = userEvent.setup();
    render(<FeatureFlagsDiagnostics />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('flag-state-repeatedWordCheck')).toHaveTextContent('Off')
    );
    const callsAfterLoad = calls;

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(calls).toBeGreaterThan(callsAfterLoad));
  });
});

/** The override control surface (phase 2b, decisions O1/O7). */
describe('FeatureFlagsDiagnostics — local override controls', () => {
  const renderPage = async (features: Record<string, boolean> = { repeatedWordCheck: false }) => {
    mockFeatures(features);
    const result = render(<FeatureFlagsDiagnostics />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.queryByTestId('flags-loading')).not.toBeInTheDocument());
    return { ...result, user: userEvent.setup() };
  };

  it('starts on "Default (from API)" with no stored override', async () => {
    await renderPage();
    expect(screen.getByTestId('flag-override-repeatedWordCheck-default')).toBeChecked();
    expect(screen.getByTestId('flag-override-repeatedWordCheck-on')).not.toBeChecked();
    expect(screen.queryByTestId('flags-override-banner')).not.toBeInTheDocument();
  });

  it('reflects a stored force-on', async () => {
    setFlagOverride('repeatedWordCheck', true);
    await renderPage();
    expect(screen.getByTestId('flag-override-repeatedWordCheck-on')).toBeChecked();
  });

  it('forcing on diverges Effective from Published and marks the row overridden', async () => {
    const { user } = await renderPage({ repeatedWordCheck: false });

    await user.click(screen.getByTestId('flag-override-repeatedWordCheck-on'));

    expect(readFlagOverrides()).toEqual({ repeatedWordCheck: true });
    expect(screen.getByTestId('flag-published-repeatedWordCheck')).toHaveTextContent('Off');
    expect(screen.getByTestId('flag-state-repeatedWordCheck')).toHaveTextContent('On');
    expect(screen.getByTestId('flag-overridden-repeatedWordCheck')).toBeInTheDocument();
    expect(screen.getByTestId('flags-override-banner')).toBeInTheDocument();
  });

  it('forcing off hides a published-on flag', async () => {
    const { user } = await renderPage({ repeatedWordCheck: true });

    await user.click(screen.getByTestId('flag-override-repeatedWordCheck-off'));

    expect(readFlagOverrides()).toEqual({ repeatedWordCheck: false });
    expect(screen.getByTestId('flag-published-repeatedWordCheck')).toHaveTextContent('On');
    expect(screen.getByTestId('flag-state-repeatedWordCheck')).toHaveTextContent('Off');
  });

  it('choosing Default clears the override', async () => {
    setFlagOverride('repeatedWordCheck', true);
    const { user } = await renderPage({ repeatedWordCheck: false });

    await user.click(screen.getByTestId('flag-override-repeatedWordCheck-default'));

    expect(readFlagOverrides()).toEqual({});
    expect(screen.getByTestId('flag-state-repeatedWordCheck')).toHaveTextContent('Off');
    expect(screen.queryByTestId('flag-overridden-repeatedWordCheck')).not.toBeInTheDocument();
  });

  it('"Reset all to default" clears everything', async () => {
    setFlagOverride('repeatedWordCheck', true);
    const { user } = await renderPage({ repeatedWordCheck: false });

    await user.click(screen.getByRole('button', { name: 'Reset all to default' }));

    expect(readFlagOverrides()).toEqual({});
    expect(screen.queryByTestId('flags-override-banner')).not.toBeInTheDocument();
  });

  it('gives each row an accessible group label naming the flag', async () => {
    await renderPage();
    expect(
      screen.getByRole('radiogroup', { name: 'Local override for repeatedWordCheck' })
    ).toBeInTheDocument();
  });
});
