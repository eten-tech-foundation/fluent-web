import { useCallback, type KeyboardEvent, type RefObject } from 'react';

import { useHistoryShortcuts } from './history-shortcuts';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

/** Capture on the wrapper, before Editorial's native keydown listeners. */
export function useEditorShortcuts(editorRef: RefObject<EditorRef | null>) {
  const handleHistoryKeys = useHistoryShortcuts(editorRef);

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const key = event.key.toLowerCase();
      const isClipboardShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        (key === 'v' || (!event.shiftKey && (key === 'c' || key === 'x')));

      if (
        isClipboardShortcut &&
        event.target instanceof HTMLElement &&
        event.target.closest('.editor-input')
      ) {
        // Editorial 0.8.15 cancels these keys and pastes through navigator.clipboard.read(),
        // which fails when clipboard-read permission is denied or the API is unavailable (#479).
        // Keep the browser default: it delivers copy/cut/paste events to Lexical, including
        // its rich clipboard data and normal change/history handling, without that permission.
        event.stopPropagation();
        return;
      }

      handleHistoryKeys(event);
    },
    [handleHistoryKeys]
  );
}
