import { createElement } from 'react';

import { readFileSync } from 'node:fs';

import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOffline } from './useOffline';

const setOnline = (online: boolean) => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
};
afterEach(() => vi.restoreAllMocks());

describe('useOffline — browser connectivity only', () => {
  it.each([true, false])('reads initial navigator.onLine=%s', online => {
    setOnline(online);
    const { result } = renderHook(useOffline);
    expect(result.current).toBe(!online);
  });

  it('subscribes to offline AND online without a remount', () => {
    setOnline(true);
    const { result } = renderHook(useOffline);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(true);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(false);
  });

  it('shares one window subscription and removes it after the last consumer unmounts', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const first = renderHook(useOffline);
    const second = renderHook(useOffline);
    const connections = add.mock.calls.filter(([name]) => name === 'online' || name === 'offline');
    expect(connections.map(([name]) => name)).toEqual(['online', 'offline']);
    first.unmount();
    expect(remove.mock.calls.filter(([name]) => name === 'online' || name === 'offline')).toEqual(
      []
    );
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(second.result.current).toBe(true);
    second.unmount();
    for (const [name, listener] of connections) {
      expect(remove).toHaveBeenCalledWith(name, listener);
    }
  });

  it('uses the online default during server rendering without browser globals', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);
    try {
      const Probe = () => String(useOffline());
      expect(renderToString(createElement(Probe))).toBe('false');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('has no queue, host-hook, resolver, or request dependency', () => {
    const source = readFileSync('src/features/tts/lib/useOffline.ts', 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
    expect(imports).toEqual(['react']);
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
