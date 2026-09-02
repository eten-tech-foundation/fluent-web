import { useCallback } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

/**
 * Undo/redo keyboard handling for the RTE surfaces (#427).
 *
 * The editor is mounted with `hasExternalUI`, and under that option it deliberately swallows the
 * history keyboard shortcuts while keeping command-based undo/redo available on its ref — the
 * host owns the history UX. This hook is that host side: attached capture-phase on the editor's
 * wrapper so it runs before the editor's own key handling, and dispatches through the ref.
 *
 * The key matrix mirrors the editor's own shortcut detection: Ctrl (or ⌘) + Z undoes,
 * Ctrl (or ⌘) + Shift + Z and Ctrl (or ⌘) + Y redo, and Alt bows out entirely.
 */
export function useHistoryShortcuts(editorRef: RefObject<EditorRef | null>) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

      const key = event.key.toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
      if (!isUndo && !isRedo) return;

      // preventDefault stops the browser's native undo on the contenteditable; stopPropagation
      // keeps the (already handled) keystroke from also reaching the editor's key handling.
      event.preventDefault();
      event.stopPropagation();
      if (isUndo) editorRef.current?.undo();
      else editorRef.current?.redo();
    },
    [editorRef]
  );
}
