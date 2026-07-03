import React from 'react';

import { config } from '@/lib/config';

import { useFeatureFlags } from './useFeatureFlags';

/**
 * Read-only diagnostics page for the published feature flags (proposal D8).
 *
 * Purpose: a human (or a support engineer) can hit one URL and see exactly what
 * `GET /config/features` reports for the environment they're in — the single
 * source of truth for "is the Repeated Word Check meant to be visible here?".
 * This is deliberately unlinked (no nav entry): you reach it only if you know
 * the path. It is login-gated by the `_authenticated` layout but has no role
 * gate, so any signed-in user can self-serve this diagnostic.
 *
 * It is strictly read-only: it renders whatever the API returned and never
 * writes or overrides a flag. The flags themselves are owned by fluent-api
 * (env-sourced), so there is nothing to toggle here — mirroring the proposal's
 * "the API owns the truth" stance (D3/D4).
 *
 * Note: because {@link useFeatureFlags} fails closed, a network error shows every
 * flag as "Off" *and* surfaces the error banner — that combination is itself the
 * signal that the values shown are the safe defaults, not confirmed state.
 */
export const FeatureFlagsDiagnostics: React.FC = () => {
  const { features, isLoading, isError, query } = useFeatureFlags();

  // Enumerate whatever the effective map contains rather than a hard-coded list,
  // so a flag added later (API + `FeatureName`) appears here automatically with
  // no change to this page.
  const entries = Object.entries(features) as Array<[string, boolean]>;

  return (
    <div className='mx-auto max-w-2xl px-8 py-10'>
      <header className='mb-6'>
        <h1 className='text-2xl font-bold'>Feature flags</h1>
        <p className='text-muted-foreground mt-1 text-sm'>
          Read-only view of what <code className='font-mono'>GET /config/features</code> reports for
          this environment. Values are owned by the API and cannot be changed here.
        </p>
        <p className='text-muted-foreground mt-1 text-xs'>
          Source: <span className='font-mono'>{config.api.url}/config/features</span> · Environment:{' '}
          <span className='font-mono'>{config.environment.current}</span>
        </p>
      </header>

      {isLoading && (
        <p className='text-muted-foreground text-sm' data-testid='flags-loading'>
          Loading flags…
        </p>
      )}

      {isError && (
        <div
          className='mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700'
          data-testid='flags-error'
          role='alert'
        >
          Could not reach the feature-flags endpoint. Showing fail-closed defaults (every flag
          treated as <strong>Off</strong>) — these are safe defaults, not confirmed values.
        </div>
      )}

      <table className='w-full border-collapse text-sm' data-testid='flags-table'>
        <thead>
          <tr className='border-b text-left'>
            <th className='py-2 pr-4 font-semibold'>Flag</th>
            <th className='py-2 font-semibold'>State</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, enabled]) => (
            <tr key={name} className='border-b last:border-b-0' data-testid={`flag-row-${name}`}>
              <td className='py-2 pr-4 font-mono'>{name}</td>
              <td className='py-2'>
                <span
                  className={
                    enabled
                      ? 'inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800'
                      : 'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600'
                  }
                  data-testid={`flag-state-${name}`}
                >
                  {enabled ? 'On' : 'Off'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {entries.length === 0 && !isLoading && (
        <p className='text-muted-foreground mt-4 text-sm'>No feature flags are defined.</p>
      )}

      <button
        className='text-primary mt-6 cursor-pointer text-sm font-semibold underline-offset-2 hover:underline'
        type='button'
        onClick={() => void query.refetch()}
      >
        Refresh
      </button>
    </div>
  );
};

export default FeatureFlagsDiagnostics;
