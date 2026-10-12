import { type PropsWithChildren, StrictMode } from 'react';

import { act, render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshHideAudio, setHideAudio } from '../settings/hideAudioStore';

import { type PauseRecord } from './pauseRecord';
import { PlaybackRegistryProvider } from './PlaybackRegistryProvider';
import { usePlayableState } from './usePlayableState';
import { usePlaybackRegistry } from './usePlaybackRegistry';

const record: PauseRecord = {
  itemIndex: 2,
  verseRef: '3',
  currentTime: 42.75,
  forceTts: true,
};
const wrapper = ({ children }: PropsWithChildren) => (
  <StrictMode>
    <PlaybackRegistryProvider>{children}</PlaybackRegistryProvider>
  </StrictMode>
);

beforeEach(() => {
  localStorage.clear();
  refreshHideAudio();
  setHideAudio(false);
});

function setup() {
  return renderHook(
    () => ({
      registry: usePlaybackRegistry(),
      a: usePlayableState('a'),
      b: usePlayableState('b'),
    }),
    { wrapper }
  );
}

describe('PlaybackRegistryProvider', () => {
  it('requires the app-wide Provider rather than silently running unregistered', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ignoreExpectedError = (event: ErrorEvent) => {
      if (event.message.includes('Audio hosts must be inside PlaybackRegistryProvider')) {
        event.preventDefault();
      }
    };
    window.addEventListener('error', ignoreExpectedError);
    try {
      expect(() => renderHook(() => usePlaybackRegistry())).toThrow('PlaybackRegistryProvider');
      expect(() => renderHook(() => usePlayableState('a'))).toThrow('PlaybackRegistryProvider');
    } finally {
      window.removeEventListener('error', ignoreExpectedError);
      errors.mockRestore();
    }
  });

  it('claim B pauses A, removes A, and only calls A again after it reclaims', () => {
    const { result } = setup();
    const a = vi.fn();
    const b = vi.fn();
    const { registry } = result.current;
    registry.claim(a);
    expect(a).not.toHaveBeenCalled();
    registry.claim(b);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    registry.silenceAll();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    registry.silenceAll();
    expect(b).toHaveBeenCalledTimes(1);
    registry.claim(a);
    registry.silenceAll();
    expect(a).toHaveBeenCalledTimes(2);
  });

  it('routes Restart only to the live claim and forgets it on release or silence', () => {
    const { result } = setup();
    const { registry } = result.current;
    const pause = vi.fn();
    const oldRestart = vi.fn();
    const newRestart = vi.fn();
    expect(registry.restartLive()).toBe(false);
    const oldRelease = registry.claim(pause, oldRestart);
    registry.claim(pause, newRestart);
    oldRelease();
    expect(registry.restartLive()).toBe(true);
    expect(newRestart).toHaveBeenCalledOnce();
    expect(oldRestart).not.toHaveBeenCalled();
    registry.silenceAll();
    expect(registry.restartLive()).toBe(false);
    const release = registry.claim(pause, oldRestart);
    release();
    expect(registry.restartLive()).toBe(false);
    expect(oldRestart).not.toHaveBeenCalled();
  });

  it('does not fall back to another playable when a native claimant has no Restart', () => {
    const { result } = setup();
    const pause = vi.fn();
    result.current.registry.claim(pause);
    expect(result.current.registry.restartLive()).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });

  it('Restart may replace its claim without losing the new registration', () => {
    const { result } = setup();
    const { registry } = result.current;
    const next = vi.fn();
    registry.claim(vi.fn(), () => registry.claim(vi.fn(), next));
    registry.restartLive();
    registry.restartLive();
    expect(next).toHaveBeenCalledOnce();
  });

  it('lets a paused or unmounted host release its claim without pausing it again', () => {
    const { result } = setup();
    const pause = vi.fn();
    const release = result.current.registry.claim(pause);
    release();
    result.current.registry.silenceAll();
    expect(pause).not.toHaveBeenCalled();
  });

  it('an old release cannot remove a newer claim using the same callback', () => {
    const { result } = setup();
    const pause = vi.fn();
    const { registry } = result.current;
    const release = registry.claim(pause);
    registry.claim(pause);
    release();
    registry.silenceAll();
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it('silences a remaining claimant when the Provider unmounts', () => {
    const { result, unmount } = setup();
    const pause = vi.fn();
    result.current.registry.claim(pause);
    unmount();
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('ends a route page after pausing claimants and ignores cleanup from an older page', () => {
    const { result } = setup();
    const { registry } = result.current;
    registry.setPageKey('first');
    registry.setRecord('a', record);
    const pause = vi.fn(() => registry.setRecord('b', record));
    registry.claim(pause);
    act(() => registry.endPage('first'));
    expect(pause).toHaveBeenCalledOnce();
    expect(registry.getRecord('a')).toBeNull();
    expect(registry.getRecord('b')).toBeNull();
    expect(registry.restartLive()).toBe(false);

    registry.setPageKey('second');
    act(() => registry.setRecord('b', record));
    act(() => registry.endPage('first'));
    expect(registry.getRecord('b')).toEqual(record);
    expect(pause).toHaveBeenCalledOnce();
  });

  it('silences the live claimant when Hide Audio flips on and retains pause records', () => {
    const { result } = setup();
    const pause = vi.fn(() => result.current.registry.setRecord('b', record));
    act(() => {
      result.current.registry.setRecord('a', { ...record, currentTime: 12 });
      result.current.registry.claim(pause);
      setHideAudio(true);
    });

    expect(pause).toHaveBeenCalledOnce();
    expect(result.current.registry.restartLive()).toBe(false);
    expect(result.current.a.record?.currentTime).toBe(12);
    expect(result.current.b.record).toEqual(record);

    act(() => setHideAudio(false));
    expect(pause).toHaveBeenCalledOnce();
    expect(result.current.a.canRestart).toBe(true);
    expect(result.current.b.canRestart).toBe(true);
  });

  it('does not silence on mount when controls were already hidden', () => {
    setHideAudio(true);
    const { result } = setup();
    const pause = vi.fn();
    result.current.registry.claim(pause);
    expect(pause).not.toHaveBeenCalled();

    act(() => setHideAudio(false));
    expect(pause).not.toHaveBeenCalled();
  });

  it('displacement can synchronously record the old key before the starter continues', () => {
    const { result } = setup();
    const { registry } = result.current;
    registry.claim(() => registry.setRecord('a', record));
    act(() => {
      registry.claim(vi.fn());
      expect(registry.getRecord('a')).toEqual(record);
    });
    expect(result.current.a.record).toEqual(record);
    expect(result.current.a.canRestart).toBe(true);
    expect(result.current.b.record).toBeNull();
  });

  it('stores data and derives Restart from a live key or a record, not badge state', () => {
    const { result } = setup();
    const { registry } = result.current;
    expect(result.current.a).toEqual({
      record: null,
      staticAi: false,
      lastDynamicAi: false,
      isLive: false,
      canRestart: false,
      impossibleReason: null,
    });
    act(() => {
      registry.setStaticAi('a', true);
      registry.setLastDynamicAi('a', true);
      registry.setImpossible('a', 'No licensed source');
    });
    expect(registry.getStaticAi('a')).toBe(true);
    expect(registry.getLastDynamicAi('a')).toBe(true);
    expect(result.current.a.impossibleReason).toBe('No licensed source');
    expect(result.current.a.canRestart).toBe(false);
    act(() => registry.setLive('a'));
    expect(registry.isLive('a')).toBe(true);
    expect(registry.canRestart('a')).toBe(true);
    act(() => registry.setRecord('a', record));
    act(() => registry.setLive('b'));
    expect(result.current.a.isLive).toBe(false);
    expect(result.current.a.canRestart).toBe(true);
    expect(result.current.b.isLive).toBe(true);
    expect(result.current.b.canRestart).toBe(true);
    act(() => registry.clearRecord('a'));
    expect(result.current.a.canRestart).toBe(false);
    expect(result.current.a.lastDynamicAi).toBe(true);
    act(() => {
      registry.setLive(null);
      registry.setStaticAi('a', false);
      registry.setLastDynamicAi('a', false);
      registry.setImpossible('a', null);
    });
    expect(result.current.b.canRestart).toBe(false);
    expect(result.current.a.staticAi).toBe(false);
    expect(result.current.a.lastDynamicAi).toBe(false);
    expect(result.current.a.impossibleReason).toBeNull();
  });

  it('drops every per-key fact on page change, but not when the page is unchanged', () => {
    const { result } = setup();
    const { registry } = result.current;
    const empty = result.current.a;
    act(() => {
      registry.setPageKey('chapter-1');
      registry.setRecord('a', record);
      registry.setStaticAi('a', true);
      registry.setLastDynamicAi('b', true);
      registry.setImpossible('b', 'No licensed source');
      registry.setLive('a');
    });
    act(() => registry.setPageKey('chapter-1'));
    expect(result.current.a.record).toEqual(record);
    expect(result.current.b.lastDynamicAi).toBe(true);
    act(() => registry.setPageKey('chapter-2'));
    expect(result.current.a).toEqual(empty);
    expect(result.current.b).toEqual(empty);
    expect(registry.isLive('a')).toBe(false);
  });

  it('notifies only the changed key and keeps the API stable', () => {
    const renders = { a: 0, b: 0, api: 0 };
    let registry: ReturnType<typeof usePlaybackRegistry> | undefined;
    function Api() {
      registry = usePlaybackRegistry();
      renders.api += 1;
      return null;
    }
    function Control({ id }: { id: 'a' | 'b' }) {
      usePlayableState(id);
      renders[id] += 1;
      return null;
    }
    render(
      <PlaybackRegistryProvider>
        <Api />
        <Control id='a' />
        <Control id='b' />
      </PlaybackRegistryProvider>
    );
    const initial = { ...renders };
    const originalApi = registry!;
    act(() => registry!.setRecord('a', record));
    expect(renders.a).toBeGreaterThan(initial.a);
    expect(renders.b).toBe(initial.b);
    expect(renders.api).toBe(initial.api);
    expect(registry).toBe(originalApi);
    const after = { ...renders };
    act(() => registry!.setRecord('a', { ...record }));
    expect(renders).toEqual(after);
  });

  it('changes subscription when a control switches keys', () => {
    const { result, rerender } = renderHook(
      ({ id }) => ({ registry: usePlaybackRegistry(), state: usePlayableState(id) }),
      { wrapper, initialProps: { id: 'a' } }
    );
    act(() => result.current.registry.setRecord('a', record));
    rerender({ id: 'b' });
    expect(result.current.state.record).toBeNull();
    act(() => result.current.registry.setRecord('b', { ...record, currentTime: 10 }));
    expect(result.current.state.record?.currentTime).toBe(10);
  });

  it('copies incoming records so callers cannot mutate a subscribed snapshot', () => {
    const { result } = setup();
    const { registry } = result.current;
    const input = { ...record };
    act(() => registry.setRecord('a', input));
    input.currentTime = 0;
    expect(registry.getRecord('a')?.currentTime).toBe(record.currentTime);
    expect(Object.isFrozen(result.current.a)).toBe(true);
    expect(Object.isFrozen(result.current.a.record)).toBe(true);
  });

  it('notifies both old and new live keys atomically and cleans up subscriptions', () => {
    const { result } = setup();
    const { registry } = result.current;
    act(() => registry.setLive('a'));
    const a = vi.fn(() => {
      expect(registry.isLive('a')).toBe(false);
      expect(registry.isLive('b')).toBe(true);
    });
    const b = vi.fn();
    const unsubscribeA = registry.subscribe('a', a);
    const unsubscribeB = registry.subscribe('b', b);
    act(() => registry.setLive('b'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubscribeA();
    unsubscribeB();
    act(() => registry.setLive(null));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('owns state and claimants per Provider, never in a module singleton', () => {
    const first = setup();
    const second = setup();
    const pause = vi.fn();
    act(() => first.result.current.registry.setRecord('a', record));
    first.result.current.registry.claim(pause);
    second.result.current.registry.silenceAll();
    expect(pause).not.toHaveBeenCalled();
    expect(second.result.current.a.record).toBeNull();
  });
});
