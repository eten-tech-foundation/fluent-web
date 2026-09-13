/**
 * `useTtsKeyboardShortcuts` — play-verse / play-from-here / stop against the
 * ACTIVE verse (§5.1, T2).
 *
 * Collision check (§5.1 makes this an explicit obligation), 2026-07-30,
 * against every key handler on the drafting page:
 *   - drafting textarea: `Enter` advances the verse, `Shift+Enter` newline
 *     (DraftingUI), plain characters type — so no unmodified letters here;
 *   - resource sidebar tabs: `ArrowLeft`/`ArrowRight`;
 *   - buttons/links: `Enter`/`Space` activation;
 *   - no global window-level app shortcuts exist today.
 * Browser-reserved combos (Ctrl+P print, Ctrl+S save…) avoided. Chosen keys
 * use the Alt layer, which types nothing into the editor, so they stay usable
 * while focus sits in the drafting textarea (where the active verse lives):
 *   Alt+P play verse · Alt+Shift+P play from here · Alt+S stop.
 * Matching is on `event.code` (physical key), not `event.key`, because
 * macOS Option+letter produces alternate characters ("π" for Option+P).
 */

import { useEffect, useRef } from 'react';

/** Documented key assignments, exported for the UI/help surface (§5.1). */
export const TTS_KEYBOARD_SHORTCUTS = {
  playVerse: 'Alt+P',
  playFromHere: 'Alt+Shift+P',
  stop: 'Alt+S',
  // Advertised by PlayableControl; binding follows with keyboard parity.
  restart: 'Alt+R',
} as const;

export interface UseTtsKeyboardShortcutsOptions {
  /** Master switch — hosts disable while the feature is gated off/hidden. */
  enabled: boolean;
  /** Acts on the host's notion of the ACTIVE verse (T2). */
  onPlayVerse: () => void;
  onPlayFromHere: () => void;
  /** Stop is global to active playback (§12.1 Keyboard row). */
  onStop: () => void;
}

export const useTtsKeyboardShortcuts = (options: UseTtsKeyboardShortcutsOptions): void => {
  // Ref'd so the window listener is attached once and never goes stale.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const current = optionsRef.current;
      if (!current.enabled) return;
      // Only the Alt layer — plain typing and Ctrl/Meta combos never match.
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === 'KeyP') {
        event.preventDefault();
        if (event.shiftKey) {
          current.onPlayFromHere();
        } else {
          current.onPlayVerse();
        }
      } else if (event.code === 'KeyS' && !event.shiftKey) {
        event.preventDefault();
        current.onStop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
};
