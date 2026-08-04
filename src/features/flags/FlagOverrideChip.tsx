import React from 'react';

import { Link } from '@tanstack/react-router';

import { useFlagOverrides } from './useFlagOverrides';

/**
 * "Flag overrides active" chip — a loud reminder that this browser is lying to
 * you about feature flags.
 *
 * Why it exists: the `/debug` page lets a developer/QA force a feature flag on
 * or off locally so a dark-shipped feature can be exercised in real hosting
 * (see `flagOverrides.ts`). Overrides never expire, so this chip is the
 * safeguard against forgetting one is on and mistaking it for real config (O6/O7).
 *
 * It is local-only: overrides live in this browser's `localStorage` and cannot
 * affect any other user or anything server-side. Read the rest on `/debug`.
 */
export const FlagOverrideChip: React.FC = () => {
  const { count, clearAll } = useFlagOverrides();

  // Nothing active → render nothing at all. That keeps the mount in
  // `AuthenticatedLayout` a single unconditional line and means zero visual
  // change (and no click interception) for everyone who has no overrides.
  if (count === 0) return null;

  return (
    <div
      className='fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-amber-400 bg-amber-100 py-1.5 pr-1.5 pl-3 text-xs font-semibold text-amber-900 shadow-lg'
      data-testid='flag-override-chip'
    >
      {/* Two separate interactive elements, never a button nested in a link. */}
      <Link className='underline-offset-2 hover:underline' to='/debug'>
        {count === 1 ? 'Flag override active (1)' : `Flag overrides active (${String(count)})`}
      </Link>
      <button
        aria-label='Reset feature-flag overrides'
        className='flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-amber-900 hover:bg-amber-200'
        type='button'
        onClick={clearAll}
      >
        ✕
      </button>
    </div>
  );
};

export default FlagOverrideChip;
