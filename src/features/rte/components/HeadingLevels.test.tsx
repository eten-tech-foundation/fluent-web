import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { ChapterEditor } from './ChapterEditor';

const descriptors = vi.hoisted(() => {
  const properties = [
    [InputEvent.prototype, 'getTargetRanges', () => []],
    [Range.prototype, 'getBoundingClientRect', () => new DOMRect()],
    [Range.prototype, 'getClientRects', () => []],
  ] as const;
  return properties.map(([prototype, key, value]) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    Object.defineProperty(prototype, key, { configurable: true, value });
    return { prototype, key, descriptor };
  });
});

afterAll(() => {
  for (const { prototype, key, descriptor } of descriptors) {
    if (descriptor) Object.defineProperty(prototype, key, descriptor);
    else Reflect.deleteProperty(prototype, key);
  }
});

/** Opens H's level menu once the bar reports a heading, as Enter on H does. */
async function openLevels() {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Section Heading' })).toHaveAttribute(
      'aria-haspopup',
      'menu'
    )
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Section Heading' }), { key: 'Enter' });
  return screen.findByRole('menu');
}

describe('heading toolbar with the real editor', () => {
  it.each([3, 4])(
    'changes H%s and saves immediate typing without touching other headings',
    async level => {
      const headings = [
        { marker: 's1', text: 'Main title' },
        { marker: 's2', text: 'Second title' },
        { marker: 's3', text: 'Third title' },
        { marker: 's4', text: 'Fourth title' },
      ];
      const verses = [
        {
          verseNumber: 1,
          text: 'First verse.',
          markers: { paragraphs: [{ marker: 'q2', offset: 0 }] },
        },
        {
          verseNumber: 2,
          text: 'Second verse.',
          markers: { headings, paragraphs: [{ marker: 'p', offset: 0 }] },
        },
      ];
      const onVersesChange = vi.fn();
      const { container } = render(
        <ChapterEditor
          bookCode='GEN'
          chapterNumber={1}
          contentKey='levels'
          targetLanguage='English'
          verses={verses}
          onVersesChange={onVersesChange}
        />
      );
      await waitFor(() => expect(container.querySelector('.usfm_s4')).toBeTruthy());
      const input = container.querySelector('.editor-input') as HTMLElement;
      act(() => {
        input.focus();
        const text = container.querySelector(`.usfm_s${level} [data-lexical-text]`)!.firstChild!;
        const range = document.createRange();
        range.setStart(text, text.textContent!.length);
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        fireEvent(document, new Event('selectionchange'));
      });
      const levels = await openLevels();
      expect(within(levels).getByRole('menuitemradio', { name: `Level ${level}` })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      onVersesChange.mockClear();
      const target = level === 3 ? 4 : 3;
      await act(async () => {
        fireEvent.click(within(levels).getByRole('menuitemradio', { name: `Level ${target}` }));
        fireEvent(
          input,
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertReplacementText',
            data: ' NEW',
          })
        );
      });
      await waitFor(() =>
        expect(onVersesChange).toHaveBeenLastCalledWith([
          {
            ...verses[1],
            markers: {
              ...verses[1].markers,
              headings: headings.map((heading, index) =>
                index === level - 1
                  ? { marker: `s${target}`, text: heading.text + ' NEW' }
                  : heading
              ),
            },
          },
        ])
      );
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      expect(
        within(await openLevels()).getByRole('menuitemradio', { name: `Level ${target}` })
      ).toHaveAttribute('aria-checked', 'true');
      expect(container.querySelector('.usfm_q2')).toHaveTextContent('First verse.');
      expect(container.querySelector('.usfm_p')).toHaveTextContent('Second verse.');
    }
  );

  // #625 QA: after Delete took an emptied heading's line, H stayed pressed and opened the levels,
  // and Remove heading stayed, because the editor's caret was left between the blocks.
  it('leaves the heading once Delete takes its emptied line', async () => {
    const verses = [
      { verseNumber: 1, text: 'First verse.', markers: null },
      {
        verseNumber: 2,
        text: 'Second verse.',
        markers: {
          headings: [{ marker: 's1', text: '' }],
          paragraphs: [{ marker: 'p', offset: 0 }],
        },
      },
    ];
    const { container } = render(
      <ChapterEditor
        bookCode='GEN'
        chapterNumber={1}
        contentKey='empty-heading'
        targetLanguage='English'
        verses={verses}
        onVersesChange={vi.fn()}
      />
    );
    await waitFor(() => expect(container.querySelector('.usfm_s1')).toBeTruthy());
    const input = container.querySelector('.editor-input') as HTMLElement;
    const sectionHeading = () => screen.getByRole('button', { name: 'Section Heading' });
    act(() => {
      input.focus();
      window.getSelection()!.collapse(container.querySelector('.usfm_s1')!, 0);
      fireEvent(document, new Event('selectionchange'));
    });
    await waitFor(() => expect(sectionHeading()).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Remove heading' })).toBeVisible();

    act(() => {
      fireEvent.keyDown(input, { key: 'Delete' });
    });

    await waitFor(() => expect(sectionHeading()).toHaveAttribute('aria-pressed', 'false'));
    expect(container.querySelector('.usfm_s1')).toBeNull();
    expect(sectionHeading()).not.toHaveAttribute('aria-haspopup');
    expect(screen.queryByRole('button', { name: 'Remove heading' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paragraph' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
