/**
 * Keyboard tests (§12.1 "Keyboard" row): shortcuts act on the active verse's
 * handlers; typing plain characters never triggers playback (the collision
 * obligation from §5.1 — the drafting textarea owns unmodified keys).
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  TTS_KEYBOARD_SHORTCUTS,
  useTtsKeyboardShortcuts,
  type UseTtsKeyboardShortcutsOptions,
} from './useTtsKeyboardShortcuts';

interface Harness {
  onPlayVerse: ReturnType<typeof vi.fn>;
  onPlayFromHere: ReturnType<typeof vi.fn>;
  onStop: ReturnType<typeof vi.fn>;
  unmount: () => void;
}

const createHarness = (overrides: Partial<UseTtsKeyboardShortcutsOptions> = {}): Harness => {
  const onPlayVerse = vi.fn();
  const onPlayFromHere = vi.fn();
  const onStop = vi.fn();
  const { unmount } = renderHook(() =>
    useTtsKeyboardShortcuts({ enabled: true, onPlayVerse, onPlayFromHere, onStop, ...overrides })
  );
  return { onPlayVerse, onPlayFromHere, onStop, unmount };
};

const press = (init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { ...init, cancelable: true, bubbles: true });
  window.dispatchEvent(event);
  return event;
};

describe('useTtsKeyboardShortcuts', () => {
  it('documents the assignments for the help/title surfaces (§5.1)', () => {
    expect(TTS_KEYBOARD_SHORTCUTS).toEqual({
      playVerse: 'Alt+P',
      playFromHere: 'Alt+Shift+P',
      stop: 'Alt+S',
      restart: 'Alt+R',
    });
  });

  it('Alt+P plays the active verse; Alt+Shift+P plays from here; Alt+S stops', () => {
    const harness = createHarness();

    const play = press({ code: 'KeyP', altKey: true });
    press({ code: 'KeyP', altKey: true, shiftKey: true });
    press({ code: 'KeyS', altKey: true });

    expect(harness.onPlayVerse).toHaveBeenCalledTimes(1);
    expect(harness.onPlayFromHere).toHaveBeenCalledTimes(1);
    expect(harness.onStop).toHaveBeenCalledTimes(1);
    expect(play.defaultPrevented).toBe(true);
  });

  it('matches on the physical key code, so macOS Option+P ("π") still works', () => {
    const harness = createHarness();

    press({ code: 'KeyP', key: 'π', altKey: true });

    expect(harness.onPlayVerse).toHaveBeenCalledTimes(1);
  });

  it('typing plain characters never triggers playback (drafting-textarea collision check, §5.1)', () => {
    const harness = createHarness();

    const plain = press({ code: 'KeyP', key: 'p' });
    press({ code: 'KeyS', key: 's' });
    press({ code: 'Enter', key: 'Enter' }); // drafting: verse advance
    press({ code: 'Enter', key: 'Enter', shiftKey: true }); // drafting: newline

    expect(harness.onPlayVerse).not.toHaveBeenCalled();
    expect(harness.onPlayFromHere).not.toHaveBeenCalled();
    expect(harness.onStop).not.toHaveBeenCalled();
    expect(plain.defaultPrevented).toBe(false);
  });

  it('Ctrl/Meta combos are left to the browser (Ctrl+P print, Cmd+S save…)', () => {
    const harness = createHarness();

    press({ code: 'KeyP', altKey: true, ctrlKey: true });
    press({ code: 'KeyS', altKey: true, metaKey: true });

    expect(harness.onPlayVerse).not.toHaveBeenCalled();
    expect(harness.onStop).not.toHaveBeenCalled();
  });

  it('does nothing while disabled, and detaches on unmount', () => {
    const harness = createHarness({ enabled: false });

    press({ code: 'KeyP', altKey: true });
    expect(harness.onPlayVerse).not.toHaveBeenCalled();

    harness.unmount();
    press({ code: 'KeyS', altKey: true });
    expect(harness.onStop).not.toHaveBeenCalled();
  });
});
