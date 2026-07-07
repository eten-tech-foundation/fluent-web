import { type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { createTestQueryClient, render, renderHook, screen, waitFor } from '@/test/render';

import { FeatureGate } from './FeatureGate';
import { failClosedFeatures } from './flags.types';
import { useFeatureFlag, useFeatureFlags } from './useFeatureFlags';

const FEATURES_URL = `${config.api.url}/config/features`;

/**
 * A QueryClientProvider wrapper pinned to a single test client (retries off, no
 * cache) so a `rerender` doesn't reset the cache. Mirrors the pattern in
 * `useRepeatedWordsCheck.test.ts`. (The hook itself also sets `retry: false`, so
 * the error case resolves immediately.)
 */
const makeWrapper = () => {
  const queryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

/** Register a GET handler for /config/features returning the given map. */
const mockFeatures = (features: Record<string, boolean>, status = 200) => {
  const calls = { count: 0 };
  server.use(
    http.get(FEATURES_URL, () => {
      calls.count += 1;
      return HttpResponse.json({ features }, { status });
    })
  );
  return calls;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('failClosedFeatures', () => {
  it('returns every known flag off, and a fresh object each call', () => {
    const a = failClosedFeatures();
    const b = failClosedFeatures();
    expect(a).toEqual({ repeatedWordCheck: false });
    expect(a).not.toBe(b); // not a shared mutable singleton
  });
});

describe('useFeatureFlags — fail-closed semantics', () => {
  it('reports every flag off while loading (before the response lands)', () => {
    mockFeatures({ repeatedWordCheck: true });
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    // First synchronous render: data hasn't arrived → fail-closed.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.features.repeatedWordCheck).toBe(false);
  });

  it('reflects the published map once loaded', async () => {
    mockFeatures({ repeatedWordCheck: true });
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.features.repeatedWordCheck).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('publishes a flag as off when the API says off', async () => {
    mockFeatures({ repeatedWordCheck: false });
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.features.repeatedWordCheck).toBe(false);
  });

  it('fails closed (all flags off) when the endpoint errors', async () => {
    mockFeatures({ repeatedWordCheck: true }, 500);
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // Even though the (unreachable) server would have said `true`, we hide.
    expect(result.current.features.repeatedWordCheck).toBe(false);
  });
});

describe('useFeatureFlag — single-flag selector', () => {
  it('returns the boolean for a named flag once loaded', async () => {
    mockFeatures({ repeatedWordCheck: true });
    const { result } = renderHook(() => useFeatureFlag('repeatedWordCheck'), {
      wrapper: makeWrapper(),
    });
    expect(result.current).toBe(false); // fail-closed during load
    await waitFor(() => expect(result.current).toBe(true));
  });
});

describe('FeatureGate', () => {
  it('renders children only after the flag resolves on (hidden while loading)', async () => {
    mockFeatures({ repeatedWordCheck: true });
    render(
      <FeatureGate feature='repeatedWordCheck'>
        <div>gated-content</div>
      </FeatureGate>,
      { wrapper: makeWrapper() }
    );
    // Fail-closed: not present on first render.
    expect(screen.queryByText('gated-content')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('gated-content')).toBeInTheDocument());
  });

  it('renders the fallback (and never the children) when the flag is off', async () => {
    mockFeatures({ repeatedWordCheck: false });
    render(
      <FeatureGate fallback={<div>fallback-content</div>} feature='repeatedWordCheck'>
        <div>gated-content</div>
      </FeatureGate>,
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(screen.getByText('fallback-content')).toBeInTheDocument());
    expect(screen.queryByText('gated-content')).not.toBeInTheDocument();
  });

  it('stays hidden (children never appear) when the endpoint errors', async () => {
    const calls = mockFeatures({ repeatedWordCheck: true }, 500);
    render(
      <FeatureGate feature='repeatedWordCheck'>
        <div>gated-content</div>
      </FeatureGate>,
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(calls.count).toBeGreaterThan(0));
    // Give React Query a tick to settle into the error state.
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText('gated-content')).not.toBeInTheDocument();
  });
});
