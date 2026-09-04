import type { KeyboardEvent, RefObject } from 'react';

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHistoryShortcuts } from '@/features/rte/lib/history-shortcuts';

import type { EditorRef } from '@eten-tech-foundation/platform-editor';

function makeEvent(overrides: Partial<KeyboardEvent<HTMLElement>>) {
  return {
    key: 'z',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent<HTMLElement>;
}

function setup() {
  const editor = { undo: vi.fn(), redo: vi.fn() };
  const ref = { current: editor } as unknown as RefObject<EditorRef | null>;
  const { result } = renderHook(() => useHistoryShortcuts(ref));
  return { editor, handler: result.current };
}

describe('useHistoryShortcuts', () => {
  it('Ctrl+Z dispatches undo and consumes the event', () => {
    const { editor, handler } = setup();
    const event = makeEvent({ ctrlKey: true });
    handler(event);
    expect(editor.undo).toHaveBeenCalledTimes(1);
    expect(editor.redo).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('⌘+Z dispatches undo', () => {
    const { editor, handler } = setup();
    handler(makeEvent({ metaKey: true }));
    expect(editor.undo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+Z dispatches redo', () => {
    const { editor, handler } = setup();
    handler(makeEvent({ ctrlKey: true, shiftKey: true }));
    expect(editor.redo).toHaveBeenCalledTimes(1);
    expect(editor.undo).not.toHaveBeenCalled();
  });

  it('Ctrl+Y dispatches redo', () => {
    const { editor, handler } = setup();
    handler(makeEvent({ key: 'y', ctrlKey: true }));
    expect(editor.redo).toHaveBeenCalledTimes(1);
  });

  it('leaves Alt combinations and plain typing alone', () => {
    const { editor, handler } = setup();
    const altEvent = makeEvent({ ctrlKey: true, altKey: true });
    const plainEvent = makeEvent({});
    handler(altEvent);
    handler(plainEvent);
    expect(editor.undo).not.toHaveBeenCalled();
    expect(editor.redo).not.toHaveBeenCalled();
    expect(altEvent.preventDefault).not.toHaveBeenCalled();
    expect(plainEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('survives an unmounted editor ref', () => {
    const ref = { current: null } as unknown as RefObject<EditorRef | null>;
    const { result } = renderHook(() => useHistoryShortcuts(ref));
    expect(() => result.current(makeEvent({ ctrlKey: true }))).not.toThrow();
  });
});
