import { type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient, render, screen, waitFor } from '@/test/render';

import { FeatureFlagsDiagnostics } from './FeatureFlagsDiagnostics';

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

afterEach(() => {
  vi.restoreAllMocks();
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
