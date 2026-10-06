import { afterEach, describe, expect, it } from 'vitest';

import { config } from '@/lib/config';

import { useAppStore } from './store';

// #314: a build without the RTE flag must not revive a stored 'chapter' display mode — the
// chapter surface cannot work there and the toggle would have no option to check.
const originalRteFlag = config.features.rtePericope;

function seedDisplayMode(displayMode: string) {
  localStorage.setItem('app-store', JSON.stringify({ state: { displayMode }, version: 0 }));
}

describe('app store rehydration', () => {
  afterEach(() => {
    config.features.rtePericope = originalRteFlag;
    localStorage.removeItem('app-store');
    useAppStore.setState({ displayMode: 'verse' });
  });

  it('keeps a stored chapter mode when the RTE flag is on', async () => {
    config.features.rtePericope = true;
    seedDisplayMode('chapter');

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().displayMode).toBe('chapter');
  });

  it('coerces a stored chapter mode to verse when the RTE flag is off', async () => {
    config.features.rtePericope = false;
    seedDisplayMode('chapter');

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState().displayMode).toBe('verse');
  });
});
