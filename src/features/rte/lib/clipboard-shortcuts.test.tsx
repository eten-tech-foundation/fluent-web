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
  const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
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
        items = { add: (file: File) => this.files.push(file) };
        private data = new Map<string, string>();
        get types() {
          return [...this.data.keys(), ...(this.files.length ? ['Files'] : [])];
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
    if (rangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRect);
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
    else Reflect.deleteProperty(Range.prototype, 'getClientRects');
  });

  it.each([false, true])('preserves extra clipboard formats and files with tabs=%s', async tabs => {
    const { container } = render(
      <Editor
        bookCode='GEN'
        chapterNumber={1}
        contentKey='clipboard-formats'
        targetLanguage='English'
        verses={[{ verseNumber: 1, text: 'First verse text.', markers: null }]}
        onVersesChange={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(container.querySelector('.editor-input')).toHaveTextContent('First verse text.')
    );
    const input = container.querySelector<HTMLElement>('.editor-input')!;
    const received: DataTransfer[] = [];
    input.addEventListener(
      'paste',
      event => {
        received.push(event.clipboardData!);
        // Inspect what reaches paste consumers without asking the editor to import a file.
        event.stopImmediatePropagation();
      },
      { capture: true }
    );
    const data = new DataTransfer();
    data.setData('text/plain', tabs ? 'one\ttwo' : 'one two');
    data.setData('text/html', tabs ? '<em>one&#9;two</em>' : '<em>one two</em>');
    data.setData('text/uri-list', 'https://example.com/verse');
    data.setData('application/x-test-annotation', '{"note":"keep\tthis"}');
    data.setData('application/x-lexical-editor', '{"nodes":[]}');
    const file = new File(['attachment'], 'note.txt', { type: 'text/plain' });
    data.items.add(file);

    fireEvent(
      input,
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
    );

    expect(received).toHaveLength(1);
    const clipboard = received[0];
    expect(clipboard.getData('text/plain')).toBe('one two');
    expect(clipboard.getData('text/html')).toBe('<em>one two</em>');
    expect(clipboard.getData('text/uri-list')).toBe('https://example.com/verse');
    expect(clipboard.getData('application/x-test-annotation')).toBe('{"note":"keep\tthis"}');
    expect(Array.from(clipboard.files)).toEqual([file]);
    expect(clipboard.getData('application/x-lexical-editor')).toBe(tabs ? '' : '{"nodes":[]}');
    expect(data.getData('text/plain')).toBe(tabs ? 'one\ttwo' : 'one two');
  });

  it('keeps the native context menu available for mouse copy and paste', async () => {
    const { container } = render(
      <Editor
        bookCode='GEN'
        chapterNumber={1}
        contentKey='context-menu'
        targetLanguage='English'
        verses={[{ verseNumber: 1, text: 'First verse text.', markers: null }]}
        onVersesChange={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(container.querySelector('.editor-input')).toHaveTextContent('First verse text.')
    );
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(container.querySelector('.editor-input [data-lexical-text]')!, event);
    expect(event.defaultPrevented).toBe(false);
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
            targetLanguage='English'
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
        targetLanguage='English'
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
