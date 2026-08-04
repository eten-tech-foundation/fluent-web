import { type ReactNode } from 'react';

import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/lib/config';
import { server } from '@/test/msw/server';
import { act, createTestQueryClient, render, renderHook, screen, waitFor } from '@/test/render';

import { FeatureGate } from './FeatureGate';
import { clearFlagOverrides, refreshFlagOverrides, setFlagOverride } from './flagOverrides';
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

beforeEach(() => {
  localStorage.clear();
  refreshFlagOverrides();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearFlagOverrides();
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

/**
 * Local overrides (phase 2b, decisions O1–O5). These prove the merge happens at
 * this single choke point, that it survives a failing fetch (the whole point),
 * and that it reaches side effects and not just render.
 */
describe('useFeatureFlags — local overrides', () => {
  it('forces a flag on when the API published it off', async () => {
    mockFeatures({ repeatedWordCheck: false });
    setFlagOverride('repeatedWordCheck', true);
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.features.repeatedWordCheck).toBe(true);
    // `published` still reports the truth from the API.
    expect(result.current.published.repeatedWordCheck).toBe(false);
    expect(result.current.overrides).toEqual({ repeatedWordCheck: true });
  });

  it('forces a flag off when the API published it on', async () => {
    mockFeatures({ repeatedWordCheck: true });
    setFlagOverride('repeatedWordCheck', false);
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.features.repeatedWordCheck).toBe(false);
    expect(result.current.published.repeatedWordCheck).toBe(true);
  });

  it('passes the published value through verbatim when there is no override', async () => {
    mockFeatures({ repeatedWordCheck: true });
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.features).toEqual(result.current.published);
    expect(result.current.overrides).toEqual({});
  });

  it('honours a force-on even while the flags fetch is failing (O4)', async () => {
    mockFeatures({ repeatedWordCheck: false }, 500);
    setFlagOverride('repeatedWordCheck', true);
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // This is the entire reason the feature exists: a dead /config/features must
    // not neutralize a deliberate local override.
    expect(result.current.features.repeatedWordCheck).toBe(true);
    expect(result.current.published.repeatedWordCheck).toBe(false);
  });

  it('honours a force-on during the initial load', () => {
    mockFeatures({ repeatedWordCheck: false });
    setFlagOverride('repeatedWordCheck', true);
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.features.repeatedWordCheck).toBe(true);
  });

  it('keeps a stable `features` identity across re-renders', async () => {
    mockFeatures({ repeatedWordCheck: true });
    const { result, rerender } = renderHook(() => useFeatureFlags(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const first = result.current.features;
    rerender();
    expect(result.current.features).toBe(first);
  });

  it('re-renders consumers when an override changes, with no page reload', async () => {
    mockFeatures({ repeatedWordCheck: false });
    const { result } = renderHook(() => useFeatureFlag('repeatedWordCheck'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current).toBe(false));

    act(() => {
      setFlagOverride('repeatedWordCheck', true);
    });
    expect(result.current).toBe(true);

    act(() => {
      clearFlagOverrides();
    });
    expect(result.current).toBe(false);
  });

  it('reveals gated UI through FeatureGate under a force-on', async () => {
    mockFeatures({ repeatedWordCheck: false });
    setFlagOverride('repeatedWordCheck', true);
    render(
      <FeatureGate feature='repeatedWordCheck'>
        <div>gated-content</div>
      </FeatureGate>,
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(screen.getByText('gated-content')).toBeInTheDocument());
  });

  it('reaches side effects, not just render: a gated query actually fires (O3)', async () => {
    mockFeatures({ repeatedWordCheck: false });
    const gatedUrl = `${config.api.url}/gated-side-effect`;
    const gatedCalls = { count: 0 };
    server.use(
      http.get(gatedUrl, () => {
        gatedCalls.count += 1;
        return HttpResponse.json({ ok: true });
      })
    );

    // Mirrors how `DraftingUI` gates its checks query: the flag drives `enabled`.
    const GatedQueryProbe = () => {
      const enabled = useFeatureFlag('repeatedWordCheck');
      const { data } = useQuery<{ ok: boolean }>({
        queryKey: ['gated-side-effect'],
        queryFn: async () => (await fetch(gatedUrl)).json() as Promise<{ ok: boolean }>,
        enabled,
      });
      return <div>{data ? 'fired' : 'idle'}</div>;
    };

    setFlagOverride('repeatedWordCheck', true);
    render(<GatedQueryProbe />, { wrapper: makeWrapper() });

    await waitFor(() => expect(gatedCalls.count).toBe(1));
    expect(screen.getByText('fired')).toBeInTheDocument();
  });

  it('does not fire a gated query when the flag is off and forced off', async () => {
    mockFeatures({ repeatedWordCheck: true });
    const gatedUrl = `${config.api.url}/gated-side-effect-off`;
    const gatedCalls = { count: 0 };
    server.use(
      http.get(gatedUrl, () => {
        gatedCalls.count += 1;
        return HttpResponse.json({ ok: true });
      })
    );

    const GatedQueryProbe = () => {
      const enabled = useFeatureFlag('repeatedWordCheck');
      useQuery<{ ok: boolean }>({
        queryKey: ['gated-side-effect-off'],
        queryFn: async () => (await fetch(gatedUrl)).json() as Promise<{ ok: boolean }>,
        enabled,
      });
      return <div>probe</div>;
    };

    setFlagOverride('repeatedWordCheck', false);
    render(<GatedQueryProbe />, { wrapper: makeWrapper() });

    await new Promise(r => setTimeout(r, 30));
    expect(gatedCalls.count).toBe(0);
  });
});
