import { useRef } from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useProtectedVerseMarkers } from './useProtectedVerseMarkers';

function Fixture({ readOnly = false }: { readOnly?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useProtectedVerseMarkers(ref);
  return (
    <div ref={ref}>
      <div suppressContentEditableWarning className='editor-input' contentEditable={!readOnly}>
        <p>
          <span className='chapter' data-testid='chapter'>
            1
          </span>
        </p>
        <p data-testid='paragraph'>
          <span className='verse' contentEditable={false} data-testid='verse-one'>
            1
          </span>
          <span data-testid='first'>First verse.</span>
          <span className='verse' contentEditable={false} data-testid='verse-two'>
            2
          </span>
          <span data-testid='second'>Second verse.</span>
        </p>
        <p data-testid='continuation'>More text in verse two.</p>
      </div>
    </div>
  );
}

function text(id: string): Text {
  return screen.getByTestId(id).firstChild as Text;
}

function select(start: Node, offset: number, end = start, endOffset = offset): Range {
  const range = document.createRange();
  range.setStart(start, offset);
  range.setEnd(end, endOffset);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  return range;
}

function insertHeadingBefore(id: string, marker = 's1'): Text {
  const heading = document.createElement('p');
  heading.setAttribute('data-marker', marker);
  const title = document.createTextNode('Section title');
  heading.append(title);
  screen.getByTestId(id).before(heading);
  return title;
}

function key(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...options });
  screen.getByTestId('first').dispatchEvent(event);
  return event;
}

function transfer(type: string, payload: Record<string, string> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(
    event,
    type === 'drop' || type === 'dragstart' ? 'dataTransfer' : 'clipboardData',
    {
      value: { getData: (format: string) => payload[format] ?? '' },
    }
  );
  screen.getByTestId('first').dispatchEvent(event);
  return event;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  cleanup();
});

describe('useProtectedVerseMarkers', () => {
  it('blocks deletion from either side of a verse, including element caret positions', () => {
    render(<Fixture />);
    select(text('second'), 0);
    expect(key('Backspace').defaultPrevented).toBe(true);
    select(text('first'), text('first').length);
    expect(key('Delete').defaultPrevented).toBe(true);
    select(screen.getByTestId('paragraph'), 3);
    expect(key('Backspace').defaultPrevented).toBe(true);
    select(screen.getByTestId('paragraph'), 2);
    expect(key('Delete').defaultPrevented).toBe(true);
  });

  it('blocks typing, Enter and deletion over a selection containing a marker', () => {
    render(<Fixture />);
    select(text('first'), 3, text('second'), 3);
    for (const name of ['x', 'Enter', 'Backspace', 'Delete']) {
      expect(key(name).defaultPrevented).toBe(true);
    }
    expect(key('ArrowRight').defaultPrevented).toBe(false);
    expect(key('c', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('leaves normal typing, paragraph splits and paragraph merges available', () => {
    render(<Fixture />);
    select(text('first'), 5);
    for (const name of ['x', 'Enter', 'Backspace', 'Delete']) {
      expect(key(name).defaultPrevented).toBe(false);
    }
    select(text('continuation'), 0);
    expect(key('Backspace').defaultPrevented).toBe(false);
    select(text('second'), text('second').length);
    expect(key('Delete').defaultPrevented).toBe(false);
  });

  it.each(['s1', 'ms1'])('prevents collapsed merges from %s into the following body', marker => {
    render(<Fixture />);
    const title = insertHeadingBefore('paragraph', marker);
    select(title, title.length);
    expect(key('Delete').defaultPrevented).toBe(true);
    select(screen.getByTestId('paragraph'), 0);
    expect(key('Backspace').defaultPrevented).toBe(true);
  });

  it('prevents collapsed merges between poetry and the following heading', () => {
    render(<Fixture />);
    screen.getByTestId('paragraph').setAttribute('data-marker', 'q1');
    const title = insertHeadingBefore('continuation');
    select(text('second'), text('second').length);
    expect(key('Delete').defaultPrevented).toBe(true);
    select(title, 0);
    expect(key('Backspace').defaultPrevented).toBe(true);
  });

  it('protects the heading/body boundary on mobile beforeinput deletion', () => {
    render(<Fixture />);
    const title = insertHeadingBefore('paragraph');
    select(title, title.length);
    const event = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentForward',
    });
    title.parentElement?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('allows editing heading text and intentionally deleting a title selection', () => {
    render(<Fixture />);
    const title = insertHeadingBefore('paragraph');
    select(title, 4);
    expect(key('Delete').defaultPrevented).toBe(false);
    expect(key('Backspace').defaultPrevented).toBe(false);
    expect(key('x').defaultPrevented).toBe(false);
    select(title, 0, title, title.length);
    expect(key('Backspace').defaultPrevented).toBe(false);
    expect(transfer('cut').defaultPrevented).toBe(false);
    // A deliberate range ending before the verse marker still contains no protected landmark.
    select(title, 3, screen.getByTestId('paragraph'), 0);
    expect(key('Delete').defaultPrevented).toBe(false);
  });

  it('allows merges between two headings', () => {
    render(<Fixture />);
    const first = insertHeadingBefore('paragraph', 's1');
    const second = insertHeadingBefore('paragraph', 's2');
    select(first, first.length);
    expect(key('Delete').defaultPrevented).toBe(false);
    select(second, 0);
    expect(key('Backspace').defaultPrevented).toBe(false);
  });

  it('allows replacing text whose range ends immediately before a marker', () => {
    render(<Fixture />);
    const range = select(text('first'), 0);
    range.setEndBefore(screen.getByTestId('verse-two'));
    expect(key('x').defaultPrevented).toBe(false);
    expect(transfer('cut').defaultPrevented).toBe(false);
  });

  it('keeps paragraph-spanning body selections editable when no marker is included', () => {
    render(<Fixture />);
    select(text('second'), 2, text('continuation'), 4);
    expect(key('Backspace').defaultPrevented).toBe(false);
    expect(transfer('paste', { 'text/plain': 'Replacement' }).defaultPrevented).toBe(false);
  });

  it('protects word and line deletes without blocking ordinary word deletion', () => {
    render(<Fixture />);
    text('second').textContent = '   Second verse.';
    select(text('second'), 3);
    expect(key('Backspace').defaultPrevented).toBe(false);
    expect(key('Backspace', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key('Backspace', { altKey: true }).defaultPrevented).toBe(true);
    select(text('second'), 9);
    expect(key('Backspace', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key('Backspace', { metaKey: true }).defaultPrevented).toBe(true);
  });

  it('protects chapter numbers as well as verse numbers', () => {
    render(<Fixture />);
    select(text('chapter'), 0, text('chapter'), 1);
    expect(key('3').defaultPrevented).toBe(true);
    expect(transfer('cut').defaultPrevented).toBe(true);
  });

  it('protects a standalone chapter marker at the preceding block boundary', () => {
    render(<Fixture />);
    const chapter = screen.getByTestId('chapter');
    chapter.parentElement?.replaceWith(chapter);
    select(screen.getByTestId('paragraph'), 0);
    expect(key('Backspace').defaultPrevented).toBe(true);
  });

  it('allows line deletion when the marker is on an earlier visual line', () => {
    render(<Fixture />);
    const range = select(text('second'), 8);
    Object.defineProperty(range, 'getClientRects', {
      value: () => [new DOMRect(0, 40, 1, 20)],
    });
    for (const id of ['verse-one', 'verse-two']) {
      Object.defineProperty(screen.getByTestId(id), 'getClientRects', {
        value: () => [new DOMRect(0, 0, 10, 10)],
      });
    }
    expect(key('Backspace', { metaKey: true }).defaultPrevented).toBe(false);
  });

  it('protects markers in a selection starting outside this editor', () => {
    render(
      <>
        <p data-testid='outside'>Outside the editor.</p>
        <Fixture />
      </>
    );
    select(text('outside'), 4, text('first'), 4);
    expect(transfer('cut').defaultPrevented).toBe(true);
  });

  it('blocks native beforeinput target ranges that cross a marker, including IME replacement', () => {
    render(<Fixture />);
    select(text('second'), 4);
    for (const inputType of ['deleteWordBackward', 'insertCompositionText']) {
      const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType });
      Object.defineProperty(event, 'getTargetRanges', {
        value: () => [
          {
            startContainer: text('first'),
            startOffset: 5,
            endContainer: text('second'),
            endOffset: 4,
          },
        ],
      });
      screen.getByTestId('second').dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('handles mobile beforeinput deletion without relying on a keyboard event', () => {
    render(<Fixture />);
    select(text('second'), 0);
    const event = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentBackward',
    });
    screen.getByTestId('second').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('blocks cut, paste and drag operations that would replace or move a marker', () => {
    render(<Fixture />);
    select(text('first'), 3, text('second'), 3);
    for (const name of ['cut', 'paste', 'dragstart', 'drop']) {
      expect(transfer(name).defaultPrevented).toBe(true);
    }
    expect(transfer('copy').defaultPrevented).toBe(false);
  });

  it('rejects incoming HTML and private Lexical structural nodes but permits ordinary rich text', () => {
    render(<Fixture />);
    select(text('first'), 3);
    for (const name of ['paste', 'drop']) {
      expect(
        transfer(name, { 'text/html': '<span data-marker="v">3</span>Copied text' })
          .defaultPrevented
      ).toBe(true);
      expect(
        transfer(name, {
          'application/x-lexical-editor': '{"nodes":[{"type":"immutable-chapter","number":"3"}]}',
        }).defaultPrevented
      ).toBe(true);
      expect(
        transfer(name, { 'text/html': '<p>One <b>paragraph</b>.</p><p>Another.</p>' })
          .defaultPrevented
      ).toBe(false);
    }
  });

  it('does not intercept edits for read-only editors', () => {
    render(<Fixture readOnly />);
    select(text('second'), 0);
    expect(key('Backspace').defaultPrevented).toBe(false);
  });
});
