import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChapterEditor } from './ChapterEditor';

import type { PericopeVerseText } from '../lib/pericope-usj';

const originalTargetRanges = vi.hoisted(() => {
  const original = Object.getOwnPropertyDescriptor(InputEvent.prototype, 'getTargetRanges');
  Object.defineProperty(InputEvent.prototype, 'getTargetRanges', {
    configurable: true,
    value: () => [],
  });
  return original;
});
afterAll(() => {
  if (originalTargetRanges)
    Object.defineProperty(InputEvent.prototype, 'getTargetRanges', originalTargetRanges);
  else Reflect.deleteProperty(InputEvent.prototype, 'getTargetRanges');
});

const rows: PericopeVerseText[] = [
  { verseNumber: 1, text: 'First verse.', markers: null },
  { verseNumber: 2, text: 'Second verse.', markers: null },
  { verseNumber: 3, text: 'Third verse.', markers: null },
];
const props = { bookCode: 'GEN', chapterNumber: 1, targetLanguage: 'English', contentKey: 'one' };
const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');

beforeEach(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});
afterEach(() => {
  if (rangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRect);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects);
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
});

async function select(input: HTMLElement, text: Node, offset: number) {
  await act(async () => {
    input.focus();
    fireEvent(
      text.parentElement ?? input,
      new MouseEvent('pointerdown', { bubbles: true, button: 0 })
    );
    const range = document.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    fireEvent(document, new Event('selectionchange'));
  });
}

async function setup(verses = rows) {
  const onVersesChange = vi.fn();
  const result = render(
    <ChapterEditor {...props} verses={verses} onVersesChange={onVersesChange} />
  );
  await waitFor(() =>
    expect(result.container.querySelector('.editor-input')).toHaveTextContent('Second verse.')
  );
  const input = result.container.querySelector<HTMLElement>('.editor-input')!;
  const verse = (number: number) =>
    input.querySelector(`[data-marker="v"][data-number="${number}"]`)!;
  const body = (number: number) => verse(number).nextSibling!.firstChild!;
  const history = async (redo = false) => {
    await act(async () => {
      fireEvent.keyDown(input, { key: redo ? 'y' : 'z', ctrlKey: true });
    });
  };
  return { ...result, input, verse, body, onVersesChange, history, user: userEvent.setup() };
}

describe('structural edits in Editorial history', () => {
  it('returns focus to the verse after adding a heading so immediate typing is saved there', async () => {
    const { input, body, onVersesChange, user } = await setup();
    await select(input, body(2), 3);
    await user.click(screen.getByRole('button', { name: 'Section Heading' }));
    await user.type(screen.getByRole('textbox', { name: 'Heading text' }), 'A title');
    await user.click(screen.getByRole('button', { name: 'Add heading' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(input);
    fireEvent(
      input,
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertReplacementText',
        data: 'New ',
      })
    );
    await waitFor(() => expect(body(2).textContent?.trim()).toBe('New Second verse.'));
    expect(onVersesChange).toHaveBeenLastCalledWith([
      {
        ...rows[1],
        text: 'New Second verse.',
        markers: {
          paragraphs: [{ marker: 'p', offset: 0 }],
          headings: [{ marker: 's1', text: 'A title' }],
        },
      },
    ]);
  });

  it('keeps the caret through scoped formatting and a second format click', async () => {
    const { input, verse, body, user } = await setup();
    await select(input, body(2), 3);
    await user.click(screen.getByRole('button', { name: 'Poetry Line' }));
    await waitFor(() => expect(verse(2).parentElement).toHaveAttribute('data-marker', 'q1'));
    expect(document.getSelection()!.anchorNode).toBe(body(2));
    expect(document.getSelection()!.anchorOffset).toBe(3);
    await user.click(screen.getByRole('button', { name: 'Increase indent' }));
    await waitFor(() => expect(verse(2).parentElement).toHaveAttribute('data-marker', 'q2'));
    expect(document.getSelection()!.anchorNode).toBe(body(2));
    expect(document.getSelection()!.anchorOffset).toBe(3);
  });

  it('keeps typing and scoped formatting as separate undo steps and clears redo after a new edit', async () => {
    const { input, verse, body, onVersesChange, history, user } = await setup();
    await select(input, body(2), 3);
    fireEvent(
      input,
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertReplacementText',
        data: 'new',
      })
    );
    await waitFor(() => expect(body(2).textContent).toContain('Secnewond verse.'));
    await user.click(screen.getByRole('button', { name: 'Poetry Line' }));
    await waitFor(() => expect(verse(2).parentElement).toHaveAttribute('data-marker', 'q1'));
    await history();
    await waitFor(() => expect(verse(2).parentElement).toBe(verse(1).parentElement));
    expect(body(2).textContent).toContain('Secnewond verse.');
    await history();
    await waitFor(() => expect(body(2).textContent?.trim()).toBe(rows[1].text));
    expect(onVersesChange).toHaveBeenLastCalledWith([rows[1]]);
    await select(input, body(2), 3);
    fireEvent(
      input,
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertReplacementText',
        data: 'other',
      })
    );
    await waitFor(() => expect(body(2).textContent).toContain('Secotherond verse.'));
    await history(true);
    expect(body(2).textContent).toContain('Secotherond verse.');
    expect(verse(2).parentElement).toBe(verse(1).parentElement);
  });

  it('undoes and redoes scoped poetry without losing text or verse identities', async () => {
    const { input, verse, body, onVersesChange, history, user } = await setup();
    await select(input, body(2), 3);
    await user.click(screen.getByRole('button', { name: 'Poetry Line' }));
    await waitFor(() => expect(verse(2).parentElement).toHaveAttribute('data-marker', 'q1'));
    expect(verse(1).parentElement).toHaveAttribute('data-marker', 'p');
    expect(verse(3).parentElement).toHaveAttribute('data-marker', 'p');
    onVersesChange.mockClear();
    await history();
    await waitFor(() => expect(verse(2).parentElement).toBe(verse(1).parentElement));
    expect(onVersesChange).toHaveBeenCalledWith([
      { ...rows[1], markers: null },
      { ...rows[2], markers: null },
    ]);
    await history(true);
    await waitFor(() => expect(verse(2).parentElement).toHaveAttribute('data-marker', 'q1'));
    expect(onVersesChange).toHaveBeenLastCalledWith([
      { ...rows[1], markers: { paragraphs: [{ marker: 'q1', offset: 0 }] } },
      { ...rows[2], markers: { paragraphs: [{ marker: 'p', offset: 0 }] } },
    ]);
    for (const row of rows) expect(body(row.verseNumber).textContent?.trim()).toBe(row.text);
  });

  it('undoes heading level then heading insertion as separate actions and saves every state', async () => {
    const { input, verse, body, onVersesChange, history, user } = await setup();
    await select(input, body(2), 3);
    await user.click(screen.getByRole('button', { name: 'Section Heading' }));
    await user.type(screen.getByRole('textbox', { name: 'Heading text' }), 'A title');
    await user.click(screen.getByRole('button', { name: 'Add heading' }));
    await waitFor(() =>
      expect(input.querySelector('[data-marker="s1"]')).toHaveTextContent('A title')
    );
    await select(input, input.querySelector('[data-marker="s1"]')!.firstChild!.firstChild!, 2);
    await user.click(screen.getByRole('button', { name: 'Level 3' }));
    await waitFor(() =>
      expect(input.querySelector('[data-marker="s3"]')).toHaveTextContent('A title')
    );
    onVersesChange.mockClear();
    await history();
    await waitFor(() =>
      expect(input.querySelector('[data-marker="s1"]')).toHaveTextContent('A title')
    );
    expect(onVersesChange).toHaveBeenLastCalledWith([
      {
        ...rows[1],
        markers: {
          paragraphs: [{ marker: 'p', offset: 0 }],
          headings: [{ marker: 's1', text: 'A title' }],
        },
      },
    ]);
    await history();
    await waitFor(() => expect(input.querySelector('[data-marker="s1"]')).toBeNull());
    expect(verse(2).parentElement).toBe(verse(1).parentElement);
    expect(onVersesChange).toHaveBeenLastCalledWith([{ ...rows[1], markers: null }]);
    await history(true);
    await waitFor(() =>
      expect(input.querySelector('[data-marker="s1"]')).toHaveTextContent('A title')
    );
    await history(true);
    await waitFor(() =>
      expect(input.querySelector('[data-marker="s3"]')).toHaveTextContent('A title')
    );
    for (const row of rows) expect(body(row.verseNumber).textContent?.trim()).toBe(row.text);
  });
});
