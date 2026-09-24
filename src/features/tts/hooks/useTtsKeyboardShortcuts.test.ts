import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  TTS_KEYBOARD_SHORTCUTS,
  useTtsKeyboardShortcuts,
  type UseTtsKeyboardShortcutsOptions,
} from './useTtsKeyboardShortcuts';

const callbacks = () => ({
  onPlay: vi.fn(),
  onPlayFromHere: vi.fn(),
  onPause: vi.fn(),
  onRestart: vi.fn(),
});

const press = (init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { ...init, cancelable: true, bubbles: true });
  window.dispatchEvent(event);
  return event;
};

// Match every exported advertisement against the actual window listener, not
// merely a second expected copy of the constant. New keys must name an action.
const actions = {
  play: 'onPlay',
  playFromHere: 'onPlayFromHere',
  pause: 'onPause',
  restart: 'onRestart',
} as const;
const bindings = Object.entries(TTS_KEYBOARD_SHORTCUTS).map(([name, chord]) => ({
  name: name as keyof typeof actions,
  chord,
  init: {
    code: `Key${chord.at(-1)}`,
    altKey: chord.includes('Alt+'),
    shiftKey: chord.includes('Shift+'),
  },
}));

describe('useTtsKeyboardShortcuts', () => {
  it('exports the four documented bindings', () => {
    expect(TTS_KEYBOARD_SHORTCUTS).toEqual({
      play: 'Alt+P',
      playFromHere: 'Alt+Shift+P',
      pause: 'Alt+S',
      restart: 'Alt+R',
    });
  });

  it.each(bindings)('$chord fires only $name once and prevents default', ({ name, init }) => {
    const handlers = callbacks();
    renderHook(() => useTtsKeyboardShortcuts({ enabled: true, ...handlers }));
    expect(press(init).defaultPrevented).toBe(true);
    for (const [key, handler] of Object.entries(handlers)) {
      expect(handler).toHaveBeenCalledTimes(key === actions[name] ? 1 : 0);
    }
  });

  it('uses the physical key code even for macOS Option+P (π)', () => {
    const handlers = callbacks();
    renderHook(() => useTtsKeyboardShortcuts({ enabled: true, ...handlers }));
    press({ code: 'KeyP', key: 'π', altKey: true });
    expect(handlers.onPlay).toHaveBeenCalledOnce();
  });

  it.each([
    { code: 'KeyR', altKey: true, shiftKey: true },
    { code: 'KeyS', altKey: true, shiftKey: true },
    ...['KeyP', 'KeyS', 'KeyR'].flatMap(code => [
      { code },
      { code, ctrlKey: true },
      { code, metaKey: true },
      { code, altKey: true, ctrlKey: true },
      { code, altKey: true, metaKey: true },
    ]),
    { code: 'Enter' },
    { code: 'Enter', shiftKey: true },
  ])('ignores unbound typing/browser combination %j', init => {
    const handlers = callbacks();
    renderHook(() => useTtsKeyboardShortcuts({ enabled: true, ...handlers }));
    expect(press(init).defaultPrevented).toBe(false);
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
  });

  it('uses fresh callbacks and enabled state without reattaching; detaches on unmount', () => {
    const old = callbacks();
    const fresh = callbacks();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender, unmount } = renderHook(
      (options: UseTtsKeyboardShortcutsOptions) => useTtsKeyboardShortcuts(options),
      { initialProps: { enabled: false, ...old } }
    );
    for (const { init } of bindings) expect(press(init).defaultPrevented).toBe(false);
    for (const handler of Object.values(old)) expect(handler).not.toHaveBeenCalled();
    const listener = add.mock.calls.find(([type]) => type === 'keydown')?.[1];
    rerender({ enabled: true, ...fresh });
    for (const { init } of bindings) expect(press(init).defaultPrevented).toBe(true);
    for (const handler of Object.values(fresh)) expect(handler).toHaveBeenCalledOnce();
    rerender({ enabled: false, ...old });
    for (const { init } of bindings) expect(press(init).defaultPrevented).toBe(false);
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    unmount();
    expect(remove).toHaveBeenCalledWith('keydown', listener);
    for (const { init } of bindings) expect(press(init).defaultPrevented).toBe(false);
    for (const handler of Object.values(old)) expect(handler).not.toHaveBeenCalled();
    add.mockRestore();
    remove.mockRestore();
  });
});
