import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyFlagOverrides,
  clearFlagOverrides,
  FLAG_OVERRIDES_STORAGE_KEY,
  overrideCount,
  readFlagOverrides,
  refreshFlagOverrides,
  setFlagOverride,
  subscribeToFlagOverrides,
} from './flagOverrides';
import { failClosedFeatures } from './flags.types';

/** Put a raw value in storage and sync the module cache to it. */
const seedRaw = (raw: string): void => {
  localStorage.setItem(FLAG_OVERRIDES_STORAGE_KEY, raw);
  refreshFlagOverrides();
};

beforeEach(() => {
  localStorage.clear();
  refreshFlagOverrides();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  refreshFlagOverrides();
});

describe('readFlagOverrides — sanitizing', () => {
  it('returns an empty map when nothing is stored', () => {
    expect(readFlagOverrides()).toEqual({});
  });

  it('reads a valid stored override', () => {
    seedRaw(JSON.stringify({ repeatedWordCheck: true }));
    expect(readFlagOverrides()).toEqual({ repeatedWordCheck: true });
  });

  it('drops keys that are not known feature flags', () => {
    seedRaw(JSON.stringify({ repeatedWordCheck: true, notARealFlag: true }));
    expect(readFlagOverrides()).toEqual({ repeatedWordCheck: true });
  });

  it('drops non-boolean values', () => {
    seedRaw(JSON.stringify({ repeatedWordCheck: 'yes' }));
    expect(readFlagOverrides()).toEqual({});
  });

  it('treats corrupt JSON as no overrides and never throws', () => {
    expect(() => {
      seedRaw('{not json at all');
    }).not.toThrow();
    expect(readFlagOverrides()).toEqual({});
  });

  it('treats non-object JSON (array / scalar) as no overrides', () => {
    seedRaw(JSON.stringify(['repeatedWordCheck']));
    expect(readFlagOverrides()).toEqual({});
    seedRaw(JSON.stringify(42));
    expect(readFlagOverrides()).toEqual({});
  });

  it('degrades to no overrides when localStorage itself throws', () => {
    vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled (private mode)');
    });
    expect(() => refreshFlagOverrides()).not.toThrow();
    expect(readFlagOverrides()).toEqual({});
  });

  it('never throws when a write fails', () => {
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => {
      setFlagOverride('repeatedWordCheck', true);
    }).not.toThrow();
  });

  it('keeps a stable object identity across reads until something changes', () => {
    const first = readFlagOverrides();
    expect(readFlagOverrides()).toBe(first); // required by useSyncExternalStore
    setFlagOverride('repeatedWordCheck', true);
    expect(readFlagOverrides()).not.toBe(first);
  });
});

describe('setFlagOverride / clearFlagOverrides', () => {
  it('forces a flag on and off', () => {
    setFlagOverride('repeatedWordCheck', true);
    expect(readFlagOverrides()).toEqual({ repeatedWordCheck: true });
    setFlagOverride('repeatedWordCheck', false);
    expect(readFlagOverrides()).toEqual({ repeatedWordCheck: false });
  });

  it('clears a single override with null (back to pass-through)', () => {
    setFlagOverride('repeatedWordCheck', true);
    setFlagOverride('repeatedWordCheck', null);
    expect(readFlagOverrides()).toEqual({});
  });

  it('removes the storage key entirely once the last override is cleared', () => {
    setFlagOverride('repeatedWordCheck', true);
    expect(localStorage.getItem(FLAG_OVERRIDES_STORAGE_KEY)).not.toBeNull();
    setFlagOverride('repeatedWordCheck', null);
    // No residue: a browser that cleared its overrides looks exactly like one
    // that never had any.
    expect(localStorage.getItem(FLAG_OVERRIDES_STORAGE_KEY)).toBeNull();
  });

  it('clearFlagOverrides drops everything', () => {
    setFlagOverride('repeatedWordCheck', false);
    clearFlagOverrides();
    expect(readFlagOverrides()).toEqual({});
    expect(localStorage.getItem(FLAG_OVERRIDES_STORAGE_KEY)).toBeNull();
  });
});

describe('store notifications', () => {
  it('notifies subscribers on write and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToFlagOverrides(listener);

    setFlagOverride('repeatedWordCheck', true);
    expect(listener).toHaveBeenCalledTimes(1);

    // A write that does not change the value must not notify (avoids needless
    // re-renders through useSyncExternalStore).
    setFlagOverride('repeatedWordCheck', true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setFlagOverride('repeatedWordCheck', false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('picks up a change made in another tab (storage event)', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToFlagOverrides(listener);

    localStorage.setItem(FLAG_OVERRIDES_STORAGE_KEY, JSON.stringify({ repeatedWordCheck: true }));
    window.dispatchEvent(
      new StorageEvent('storage', { key: FLAG_OVERRIDES_STORAGE_KEY, newValue: 'ignored' })
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(readFlagOverrides()).toEqual({ repeatedWordCheck: true });
    unsubscribe();
  });

  it('ignores storage events for unrelated keys', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToFlagOverrides(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'some.other.key' }));
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('helpers', () => {
  it('overrideCount counts active overrides', () => {
    expect(overrideCount({})).toBe(0);
    expect(overrideCount({ repeatedWordCheck: false })).toBe(1);
  });

  it('applyFlagOverrides layers overrides on top of the published map', () => {
    const published = { ...failClosedFeatures(), repeatedWordCheck: true };
    expect(applyFlagOverrides(published, {})).toEqual({ repeatedWordCheck: true });
    expect(applyFlagOverrides(published, { repeatedWordCheck: false })).toEqual({
      repeatedWordCheck: false,
    });
    // Does not mutate its input.
    expect(published.repeatedWordCheck).toBe(true);
  });
});
