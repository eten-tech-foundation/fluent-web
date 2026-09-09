import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChapterEditor } from '../components/ChapterEditor';
import { PericopeEditor } from '../components/PericopeEditor';

// Keep the actual Editorial/Lexical surface: a stand-in misses its root keydown listener,
// which cancels native paste and calls navigator.clipboard.read() (#479).
describe.each([
  ['Pericope View', PericopeEditor],
  ['Chapter View', ChapterEditor],
] as const)('%s clipboard shortcuts', (_name, Editor) => {
  beforeEach(() => {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
    vi.stubGlobal('DragEvent', class extends Event {});
    // jsdom has no ClipboardEvent; Lexical checks its constructor on copy/cut.
    vi.stubGlobal(
      'ClipboardEvent',
      class ClipboardEvent extends Event {
        clipboardData: DataTransfer | null;
        constructor(type: string, init: ClipboardEventInit = {}) {
          super(type, init);
          this.clipboardData = init.clipboardData ?? null;
        }
      }
    );
    vi.stubGlobal(
      'DataTransfer',
      class DataTransfer {
        files: File[] = [];
        private data = new Map<string, string>();
        get types() {
          return [...this.data.keys()];
        }
        getData(type: string) {
          return this.data.get(type) ?? '';
        }
        setData(type: string, text: string) {
          this.data.set(type, text);
        }
      }
    );
    Object.defineProperty(document, 'execCommand', { configurable: true, value: () => false });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'execCommand');
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    Reflect.deleteProperty(Range.prototype, 'getClientRects');
  });

  it.each(
    ['c', 'x', 'v', 'V'].flatMap(key => ['ctrlKey', 'metaKey'].map(modifier => ({ key, modifier })))
  )(
    'leaves $modifier+$key to the browser without reading the clipboard',
    async ({ key, modifier }) => {
      // An unanswered browser permission prompt never resolves. The shortcut must not open it.
      const read = vi.fn(() => new Promise<ClipboardItems>(() => {}));
      const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } });
      try {
        const { container } = render(
          <Editor
            bookCode='GEN'
            chapterNumber={1}
            contentKey='clipboard'
            verses={[{ verseNumber: 1, text: 'First verse text.', markers: null }]}
            onVersesChange={vi.fn()}
          />
        );
        await waitFor(() =>
          expect(container.querySelector('.editor-input')).toHaveTextContent('First verse text.')
        );
        const input = container.querySelector('.editor-input')!;
        const keyDown = vi.fn();
        input.addEventListener('keydown', keyDown);
        const event = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key,
          [modifier]: true,
          shiftKey: key === 'V',
        });
        fireEvent(input, event);
        expect(event.defaultPrevented).toBe(false);
        expect(read).not.toHaveBeenCalled();
        expect(keyDown).not.toHaveBeenCalled();
      } finally {
        if (original) Object.defineProperty(navigator, 'clipboard', original);
        else Reflect.deleteProperty(navigator, 'clipboard');
      }
    }
  );

  it.each([
    { name: 'plain text', text: 'one two', html: '' },
    { name: 'tab-separated text', text: 'one\ttwo', html: '' },
    { name: 'formatted text with an encoded tab', text: 'one\ttwo', html: '<em>one&#9;two</em>' },
  ])('saves the words from a native paste of $name', async ({ text, html }) => {
    const onVersesChange = vi.fn();
    const { container } = render(
      <Editor
        bookCode='GEN'
        chapterNumber={1}
        contentKey='tabs'
        verses={[{ verseNumber: 1, text: 'First verse text.', markers: null }]}
        onVersesChange={onVersesChange}
      />
    );
    await waitFor(() =>
      expect(container.querySelector('.editor-input')).toHaveTextContent('First verse text.')
    );
    const input = container.querySelector<HTMLElement>('.editor-input')!;
    await act(async () => {
      input.focus();
      const range = document.createRange();
      range.selectNodeContents(input.querySelector('[data-lexical-text]')!);
      range.collapse(false);
      document.getSelection()!.removeAllRanges();
      document.getSelection()!.addRange(range);
      fireEvent(document, new Event('selectionchange'));
    });
    const data = new DataTransfer();
    data.setData('text/plain', text);
    if (html) data.setData('text/html', html);
    fireEvent(
      input,
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );
    await waitFor(() =>
      expect(onVersesChange).toHaveBeenLastCalledWith([
        {
          verseNumber: 1,
          text: 'First verse text.one two',
          markers: { paragraphs: [{ marker: 'p', offset: 0 }] },
        },
      ])
    );
  });
});
