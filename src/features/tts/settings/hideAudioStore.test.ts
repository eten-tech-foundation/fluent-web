import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HIDE_AUDIO_STORAGE_KEY,
  readHideAudio,
  refreshHideAudio,
  setHideAudio,
  subscribeHideAudio,
} from './hideAudioStore';

beforeEach(() => {
  vi.restoreAllMocks();
  setHideAudio(false);
  localStorage.clear();
  refreshHideAudio();
});

describe('hideAudioStore', () => {
  it('defaults to shown when storage has no preference', () => {
    expect(readHideAudio()).toBe(false);
  });

  it('persists hidden, removes shown, and notifies only for changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHideAudio(listener);

    setHideAudio(true);
    expect(localStorage.getItem(HIDE_AUDIO_STORAGE_KEY)).toBe('true');
    expect(readHideAudio()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    setHideAudio(true);
    expect(listener).toHaveBeenCalledOnce();
    setHideAudio(false);
    expect(localStorage.getItem(HIDE_AUDIO_STORAGE_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('refreshes and notifies for a storage event from another tab', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHideAudio(listener);
    localStorage.setItem(HIDE_AUDIO_STORAGE_KEY, 'true');

    window.dispatchEvent(new StorageEvent('storage', { key: HIDE_AUDIO_STORAGE_KEY }));

    expect(readHideAudio()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('falls back to session memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => setHideAudio(true)).not.toThrow();
    expect(readHideAudio()).toBe(true);
    expect(() => refreshHideAudio()).not.toThrow();
    expect(readHideAudio()).toBe(true);
  });
});
