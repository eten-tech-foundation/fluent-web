import type { ClipboardEvent, MouseEvent } from 'react';

/** The built-in Paste menu also uses the permission-gated Clipboard API. */
export function handleEditorContextMenu(event: MouseEvent<HTMLElement>) {
  if (event.target instanceof HTMLElement && event.target.closest('.editor-input')) {
    // Leave the default action intact so the browser can supply its native clipboard menu.
    event.stopPropagation();
  }
}

/** Keep the shared editor's tab-to-space cleanup when using native paste events. */
export function handleEditorPaste(event: ClipboardEvent<HTMLElement>) {
  const target = event.target;
  if (
    !(target instanceof HTMLElement) ||
    !target.closest('.editor-input[contenteditable="true"]')
  ) {
    return;
  }

  const text = event.clipboardData.getData('text/plain');
  if (!text.includes('\t')) return;

  // Lexical creates TabNodes for native tabs, but Editorial's USJ serializer drops them,
  // joining adjacent words. Replay just this paste with spaces before Lexical imports it.
  const data = new DataTransfer();
  for (const type of event.clipboardData.types) {
    if (
      type !== 'Files' &&
      type !== 'text/plain' &&
      type !== 'text/html' &&
      type !== 'application/x-lexical-editor'
    ) {
      data.setData(type, event.clipboardData.getData(type));
    }
  }
  for (const file of event.clipboardData.files) data.items.add(file);
  data.setData('text/plain', text.replace(/\t/g, ' '));
  const html = event.clipboardData.getData('text/html');
  if (html) {
    // Decode HTML entities too, without changing attributes or activating the pasted markup.
    const template = document.createElement('template');
    template.innerHTML = html;
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      node.textContent = node.textContent?.replace(/\t/g, ' ') ?? '';
    }
    data.setData('text/html', template.innerHTML);
  }
  // Only omit Lexical's private JSON flavor, which would restore unsupported TabNodes
  // instead of the normalized HTML/plain text. Preserve other formats and files for consumers.
  event.preventDefault();
  event.stopPropagation();
  target.dispatchEvent(
    new window.ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    })
  );
}
