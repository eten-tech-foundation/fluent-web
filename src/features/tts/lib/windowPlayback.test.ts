import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeClipElement } from '../testing/fakeClipElement';

import { areAdjacentSources, watchPlaybackWindow } from './windowPlayback';

import type { Source } from '../seam/types';

const source = (window?: Source['window'], url = 'same'): Source => ({
  url,
  window,
  durationIsMeasured: false,
});
afterEach(() => vi.useRealTimers());
const setup = () => {
  vi.useFakeTimers();
  const element = new FakeClipElement();
  element.currentTime = 10;
  const boundary = vi.fn();
  const window = watchPlaybackWindow(element, boundary);
  window.setSource(source([10, 20]));
  element.emit('playing');
  return { element, boundary, window };
};

describe('window scheduler', () => {
  it('uses scheduled media time, never timeupdate or a wall-clock-only assumption', async () => {
    const h = setup();
    await vi.advanceTimersByTimeAsync(10_000); // A stalled element has not moved.
    expect(h.boundary).not.toHaveBeenCalled();
    h.element.currentTime = 20;
    h.element.emit('timeupdate');
    expect(h.boundary).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.boundary).toHaveBeenCalledOnce();
    h.window.detach();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-arms against current time and playbackRate after a rate change', async () => {
    const h = setup();
    h.element.currentTime = 14;
    h.element.playbackRate = 2;
    h.element.emit('ratechange');
    await vi.advanceTimersByTimeAsync(2999);
    expect(h.boundary).not.toHaveBeenCalled();
    h.element.currentTime = 20;
    await vi.advanceTimersByTimeAsync(1);
    expect(h.boundary).toHaveBeenCalledOnce();
  });

  it('cancels on seeking and schedules from the actual seek landing', async () => {
    const h = setup();
    h.element.emit('seeking');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.boundary).not.toHaveBeenCalled();
    h.element.currentTime = 18;
    h.element.emit('seeked');
    h.element.currentTime = 20;
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.boundary).toHaveBeenCalledOnce();
  });

  it.each(['pause', 'waiting', 'error', 'ended'])(
    'suspends on %s and waits for playing',
    async event => {
      const h = setup();
      h.element.emit(event);
      h.element.currentTime = 20;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(h.boundary).not.toHaveBeenCalled();
      h.element.emit('playing');
      await vi.advanceTimersByTimeAsync(1);
      expect(h.boundary).toHaveBeenCalledOnce();
    }
  );

  it('keeps the halt armed when fetching stalls but buffered media is still sounding', async () => {
    const h = setup();
    h.element.emit('stalled'); // Network progress stopped, not necessarily playback.
    h.element.currentTime = 20;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.boundary).toHaveBeenCalledOnce();
  });

  it('replaces the old endpoint and ignores it while the new source loads', async () => {
    const h = setup();
    h.window.setSource(source([30, 40], 'new'));
    h.element.currentTime = 30;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.boundary).not.toHaveBeenCalled();
    h.element.emit('playing');
    h.element.currentTime = 40;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.boundary).toHaveBeenCalledOnce();
  });

  it('open-ended and windowless sources have no synthetic halt; detach removes all listeners', async () => {
    const h = setup();
    h.window.setSource(source([20]), true);
    expect(vi.getTimerCount()).toBe(0);
    h.window.setSource(source(), true);
    expect(vi.getTimerCount()).toBe(0);
    h.window.detach();
    h.element.emit('playing');
    h.element.emit('ratechange');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.boundary).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('merges only the same opaque URL and exactly adjacent closed windows', () => {
    expect(areAdjacentSources(source([10, 20]), source([20, 30]))).toBe(true);
    for (const next of [
      source([21, 30]),
      source([19, 30]),
      source([20, 30], 'other'),
      source(),
      source([20]),
    ]) {
      expect(areAdjacentSources(source([10, 20]), next)).toBe(false);
    }
    expect(areAdjacentSources(source([10]), source([20, 30]))).toBe(false);
  });
});
