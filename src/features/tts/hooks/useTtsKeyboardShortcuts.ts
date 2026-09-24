/**
 * The keyboard is the button: shortcuts invoke the same guarded actions as
 * on-screen controls, never an extra pause-then-reset chord.
 * Alt+P: active verse/pericope primary (pericope starts via caret seek);
 * Alt+Shift+P: play from the caret through the page's visible playables;
 * Alt+S: sounding primary's Pause, app-wide; Alt+R: sounding Restart,
 * falling back to the caret's verse/pericope Restart only when silent.
 * Continuous playback is keyboard-triggered, without another visible button.
 * Discovery is hover/focus text only; there is no separate help route.
 *
 * Collision sweep, 2026-09-13, drafting-reachable handlers under src/:
 * - DraftingUI textarea (also DraftingGridVerse/Pericope): Enter advances,
 *   Shift+Enter inserts a newline; pericope cards: Enter/Space activation.
 * - DraftingResourceSidebar: Left/Right; DisplayModeToggle: arrow steps;
 *   SearchableSelect: Up/Down, Enter, Escape; header: Enter/Space.
 * - PericopeEditor/ChapterEditor use history-shortcuts: Ctrl/Meta+Z/Y,
 *   explicitly excluding Alt. No direct @tiptap imports in src/.
 * - ScrubBar/Radix Slider: arrows, Home/End, PageUp/Down, Escape.
 * Other grep hits: ObserverDashboard/LegalLayout (Enter/Space, other routes),
 * language-code comparisons and flagOverrides' storage event (not keydown).
 * No other application Alt-letter handler was found. Ctrl/Meta shortcuts are
 * left to the browser. Alt+R can be a Firefox Windows menu accelerator when
 * the menu bar is shown; browser/OS interception remains platform-dependent.
 * Match event.code, not event.key: macOS Option+P produces "π".
 */

import { useEffect, useRef } from 'react';

/**
 * Registration ↔ advertisements: PlayableControl in components/TtsVerseControls.tsx
 * hosts primary Play/Pause tooltip + aria-keyshortcuts and Restart tooltip + aria.
 * settings/HideAudioSettings.tsx will host all four in switch hover text (including
 * the only play-from-here advertisement). Keep these sites and bindings in sync.
 */
export const TTS_KEYBOARD_SHORTCUTS = {
  play: 'Alt+P',
  playFromHere: 'Alt+Shift+P',
  pause: 'Alt+S',
  restart: 'Alt+R',
} as const;

export interface UseTtsKeyboardShortcutsOptions {
  /** Hosts disable while gated off, hidden, or in chapter view without controls. */
  enabled: boolean;
  /** Acts on the caret's visible playable, using its primary/seek guards. */
  onPlay: () => void;
  onPlayFromHere: () => void;
  /** Registry silence-all; follows each sounding surface's primary action. */
  onPause: () => void;
  /** Sounding Restart, or the caret's visible playable Restart when silent. */
  onRestart: () => void;
}

export const useTtsKeyboardShortcuts = (options: UseTtsKeyboardShortcutsOptions): void => {
  // Ref'd so the window listener is attached once and never goes stale.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const current = optionsRef.current;
      if (!current.enabled) return;
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      // Advertisements: PlayableControl primary/Restart and HideAudioSettings
      // switch hover text; see the constant above before changing any branch.
      if (event.code === 'KeyP') {
        event.preventDefault();
        if (event.shiftKey) current.onPlayFromHere();
        else current.onPlay();
      } else if (event.code === 'KeyS' && !event.shiftKey) {
        event.preventDefault();
        current.onPause();
      } else if (event.code === 'KeyR' && !event.shiftKey) {
        event.preventDefault();
        current.onRestart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
};
