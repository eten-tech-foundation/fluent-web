import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTruncation } from './useTruncation';

describe('useTruncation', () => {
  let observerCallback: (() => void) | null = null;
  const observeMock = vi.fn();
  const disconnectMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    observeMock.mockClear();
    disconnectMock.mockClear();
    observerCallback = null;

    class MockResizeObserver {
      constructor(callback: () => void) {
        observerCallback = callback;
      }
      observe = observeMock;
      unobserve = vi.fn();
      disconnect = disconnectMock;
    }

    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('initializes with isTruncated = false before an element is attached', () => {
    const { result } = renderHook(() => useTruncation('Short text'));
    expect(result.current.isTruncated).toBe(false);
  });

  it('detects truncation when element scrollWidth > clientWidth', () => {
    const { result } = renderHook(() => useTruncation('Long text that overflows'));

    const div = document.createElement('div');
    Object.defineProperty(div, 'scrollWidth', { value: 200, configurable: true });
    Object.defineProperty(div, 'clientWidth', { value: 100, configurable: true });

    act(() => {
      if (typeof result.current.ref === 'function') {
        result.current.ref(div);
      }
    });

    expect(result.current.isTruncated).toBe(true);
    expect(observeMock).toHaveBeenCalledWith(div);
  });

  it('detects no truncation when element scrollWidth <= clientWidth', () => {
    const { result } = renderHook(() => useTruncation('Short text'));

    const div = document.createElement('div');
    Object.defineProperty(div, 'scrollWidth', { value: 80, configurable: true });
    Object.defineProperty(div, 'clientWidth', { value: 100, configurable: true });

    act(() => {
      if (typeof result.current.ref === 'function') {
        result.current.ref(div);
      }
    });

    expect(result.current.isTruncated).toBe(false);
    expect(observeMock).toHaveBeenCalledWith(div);
  });

  it('reattaches observer when the measured element node changes', () => {
    const { result } = renderHook(() => useTruncation('Text'));

    const initialDiv = document.createElement('div');
    Object.defineProperty(initialDiv, 'scrollWidth', { value: 150, configurable: true });
    Object.defineProperty(initialDiv, 'clientWidth', { value: 100, configurable: true });

    act(() => {
      if (typeof result.current.ref === 'function') {
        result.current.ref(initialDiv);
      }
    });

    expect(result.current.isTruncated).toBe(true);
    expect(observeMock).toHaveBeenCalledWith(initialDiv);

    // Simulate node replacement (e.g. Radix Tooltip wrapping the element)
    const replacementDiv = document.createElement('div');
    Object.defineProperty(replacementDiv, 'scrollWidth', { value: 50, configurable: true });
    Object.defineProperty(replacementDiv, 'clientWidth', { value: 100, configurable: true });

    act(() => {
      if (typeof result.current.ref === 'function') {
        result.current.ref(replacementDiv);
      }
    });

    // Observer disconnected from previous node and reattached to new node
    expect(disconnectMock).toHaveBeenCalled();
    expect(observeMock).toHaveBeenCalledWith(replacementDiv);
    expect(result.current.isTruncated).toBe(false);
  });

  it('updates truncation when container resizes via ResizeObserver', () => {
    const { result } = renderHook(() => useTruncation('Dynamic text'));

    const div = document.createElement('div');
    let clientWidth = 100;
    Object.defineProperty(div, 'scrollWidth', { value: 150, configurable: true });
    Object.defineProperty(div, 'clientWidth', {
      get: () => clientWidth,
      configurable: true,
    });

    act(() => {
      if (typeof result.current.ref === 'function') {
        result.current.ref(div);
      }
    });

    expect(result.current.isTruncated).toBe(true);

    // Expand container: clientWidth expands to 200 > scrollWidth 150
    clientWidth = 200;
    act(() => {
      observerCallback?.();
      vi.advanceTimersByTime(150);
    });

    expect(result.current.isTruncated).toBe(false);
  });

  it('cleans up observer and listeners on unmount', () => {
    const { result, unmount } = renderHook(() => useTruncation('Text'));

    const div = document.createElement('div');
    act(() => {
      if (typeof result.current.ref === 'function') {
        result.current.ref(div);
      }
    });

    unmount();
    expect(disconnectMock).toHaveBeenCalled();
  });
});
