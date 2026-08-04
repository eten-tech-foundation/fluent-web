import React from 'react';

import { config } from '@/lib/config';

import { type FeatureName, type Features } from './flags.types';
import { useFeatureFlags } from './useFeatureFlags';
import { useFlagOverrides } from './useFlagOverrides';

/**
 * Diagnostics page for feature flags (proposal D8), plus the local override
 * controls that the source-TTS proposal relies on (§6.3 / T12, §11.3 step 4).
 *
 * Purpose: a human (or a support engineer) can hit one URL and see exactly what
 * `GET /config/features` reports for the environment they're in — the single
 * source of truth for "is this feature meant to be visible here?". Deliberately
 * unlinked (no nav entry): you reach it only if you know the path. It is
 * login-gated by the `_authenticated` layout but has **no role gate** on
 * purpose — you must be able to open it *as a translator* to see what a
 * translator sees.
 *
 * The **Published** column is what the API says (fail-closed while loading or on
 * error); the **Effective** column is what the app actually behaves like. They
 * differ only when this browser has a local override.
 *
 * About the overrides: they are stored in this browser's `localStorage` and
 * nowhere else — no cookie, no header, no API field, so the backend cannot even
 * tell (O2). They are intentionally available in production builds (O5), because
 * their reason to exist is exercising a dark-shipped feature in its real hosting
 * environment before its flag is turned on for real. Forcing a flag on grants no
 * access: the API publishes flags but does not enforce them (feature-flags D5),
 * and auth/permissions are still checked on every real request. See
 * `flagOverrides.ts` for the full rules.
 */
export const FeatureFlagsDiagnostics: React.FC = () => {
  const { features, published, isLoading, isError, query } = useFeatureFlags();
  const { overrides, setOverride, clearAll, count } = useFlagOverrides();

  // Enumerate whatever the effective map contains rather than a hard-coded list,
  // so a flag added later (API + `FeatureName`) appears here automatically with
  // no change to this page. `features` is `Record<FeatureName, boolean>`, so
  // `Object.entries` is already `[string, boolean][]` — no cast needed (W4).
  const entries = Object.entries(features);

  return (
    <div className='mx-auto max-w-3xl px-8 py-10'>
      <header className='mb-6'>
        <h1 className='text-2xl font-bold'>Feature flags</h1>
        <p className='text-muted-foreground mt-1 text-sm'>
          What <code className='font-mono'>GET /config/features</code> reports for this environment,
          and what this browser is actually using. Flag values are owned by the API; the overrides
          below are <strong>local to this browser only</strong> and are never sent anywhere.
        </p>
        <p className='text-muted-foreground mt-1 text-xs'>
          Source: <span className='font-mono'>{config.api.url}/config/features</span> · Environment:{' '}
          <span className='font-mono'>{config.environment.current}</span> · Version:{' '}
          <span className='font-mono'>{__APP_VERSION__}</span>
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

      {count > 0 && (
        <div
          className='mb-4 flex items-center justify-between gap-4 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900'
          data-testid='flags-override-banner'
        >
          <span>
            <strong>
              {count === 1 ? '1 flag is overridden' : `${String(count)} flags are overridden`}
            </strong>{' '}
            in this browser. The app is not behaving the way the API says it should.
          </span>
          <button
            className='shrink-0 cursor-pointer font-semibold underline underline-offset-2'
            type='button'
            onClick={clearAll}
          >
            Reset all to default
          </button>
        </div>
      )}

      <table className='w-full border-collapse text-sm' data-testid='flags-table'>
        <thead>
          <tr className='border-b text-left'>
            <th className='py-2 pr-4 font-semibold'>Flag</th>
            <th className='py-2 pr-4 font-semibold'>Published</th>
            <th className='py-2 pr-4 font-semibold'>Effective</th>
            <th className='py-2 font-semibold'>Local override</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, enabled]) => {
            const featureName = name as FeatureName;
            // Read through `Partial` on purpose: the enumeration is data-driven,
            // so `name` may be a flag the API added before `FeatureName` caught
            // up, in which case `published` genuinely has no entry for it.
            const publishedValue = (published as Partial<Features>)[featureName] ?? false;
            const isOverridden = overrides[featureName] !== undefined;

            return (
              <tr
                key={name}
                className={
                  isOverridden ? 'border-b bg-amber-50 last:border-b-0' : 'border-b last:border-b-0'
                }
                data-testid={`flag-row-${name}`}
              >
                <td className='py-2 pr-4 font-mono'>{name}</td>
                <td className='py-2 pr-4'>
                  <StateBadge enabled={publishedValue} testId={`flag-published-${name}`} />
                </td>
                <td className='py-2 pr-4'>
                  <StateBadge enabled={enabled} testId={`flag-state-${name}`} />
                  {isOverridden && (
                    <span
                      className='ml-2 inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-900 uppercase'
                      data-testid={`flag-overridden-${name}`}
                    >
                      Overridden
                    </span>
                  )}
                </td>
                <td className='py-2'>
                  <OverrideControl
                    name={featureName}
                    value={overrides[featureName]}
                    onChange={setOverride}
                  />
                </td>
              </tr>
            );
          })}
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

const StateBadge: React.FC<{ enabled: boolean; testId: string }> = ({ enabled, testId }) => (
  <span
    className={
      enabled
        ? 'inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800'
        : 'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600'
    }
    data-testid={testId}
  >
    {enabled ? 'On' : 'Off'}
  </span>
);

/**
 * Tri-state control for one flag (O1). "Default (from API)" is the pass-through
 * state and is represented by the absence of a stored value, not a third value.
 * Native radios so keyboard operation and grouping come for free.
 */
const OverrideControl: React.FC<{
  name: FeatureName;
  value: boolean | undefined;
  onChange: (name: FeatureName, value: boolean | null) => void;
}> = ({ name, value, onChange }) => {
  const options: Array<{ label: string; key: string; selected: boolean; next: boolean | null }> = [
    { label: 'Default (from API)', key: 'default', selected: value === undefined, next: null },
    { label: 'Force on', key: 'on', selected: value === true, next: true },
    { label: 'Force off', key: 'off', selected: value === false, next: false },
  ];

  return (
    <div
      aria-label={`Local override for ${name}`}
      className='flex flex-wrap gap-3'
      role='radiogroup'
    >
      {options.map(option => (
        <label key={option.key} className='flex cursor-pointer items-center gap-1 text-xs'>
          <input
            checked={option.selected}
            className='cursor-pointer'
            data-testid={`flag-override-${name}-${option.key}`}
            name={`flag-override-${name}`}
            type='radio'
            onChange={() => {
              onChange(name, option.next);
            }}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
};

export default FeatureFlagsDiagnostics;
