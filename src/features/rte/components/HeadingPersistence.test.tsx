import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  pericopeVersesToUsj,
  usjToPericopeVerses,
  type PericopeVerseText,
} from '../lib/pericope-usj';

import { ChapterEditor } from './ChapterEditor';
import { PericopeEditor } from './PericopeEditor';

import type { Usj } from '@eten-tech-foundation/scripture-utilities';

// This document adapter exercises each host's save/reload contract. Real editor interaction is
// covered separately in format-heading.test.tsx and the browser regression checks.
const editor = vi.hoisted(() => ({
  usj: undefined as Usj | undefined,
  commit: undefined as ((usj: Usj) => void) | undefined,
  load: vi.fn<(usj: Usj) => void>(),
}));

vi.mock('@eten-tech-foundation/platform-editor', async () => {
  const react = await import('react');
  interface StubProps {
    defaultUsj: Usj;
    onUsjChange: (usj: Usj) => void;
  }

  return {
    Editorial: react.forwardRef<unknown, StubProps>(({ defaultUsj, onUsjChange }, ref) => {
      editor.usj ??= defaultUsj;
      editor.commit = onUsjChange;
      react.useImperativeHandle(ref, () => ({
        setUsj: (usj: Usj) => {
          editor.usj = usj;
          editor.load(usj);
          onUsjChange(usj);
        },
      }));
      react.useEffect(() => {
        onUsjChange(editor.usj as Usj);
      }, [onUsjChange]);
      return react.createElement('div', { 'data-testid': 'editorial' });
    }),
  };
});

const rows: PericopeVerseText[] = [
  {
    verseNumber: 1,
    text: 'Previous verse.',
    markers: { paragraphs: [{ marker: 'q2', offset: 0 }] },
  },
  {
    verseNumber: 2,
    text: 'First line. Second line.',
    markers: {
      headings: [{ marker: 's1', text: 'Original title' }],
      paragraphs: [
        { marker: 'p', offset: 0 },
        { marker: 'q1', offset: 12 },
      ],
    },
  },
];

const props = { bookCode: 'GEN', chapterNumber: 1, targetLanguage: 'Spanish' };

// The two wrappers expose the same persistence contract even though only chapter view has a bar.
describe.each([
  ['ChapterEditor', ChapterEditor],
  ['PericopeEditor', PericopeEditor],
] as const)('%s heading persistence (#432)', (_name, Component) => {
  beforeEach(() => {
    editor.usj = undefined;
    editor.commit = undefined;
    editor.load.mockClear();
  });

  it.each(['edit', 'remove'] as const)(
    'saves a heading-only %s and reloads it without changing scripture or saving an echo',
    change => {
      const onVersesChange = vi.fn<(changed: PericopeVerseText[]) => void>();
      const { rerender } = render(
        <Component {...props} contentKey='original' verses={rows} onVersesChange={onVersesChange} />
      );
      expect(onVersesChange).not.toHaveBeenCalled();

      const editedUsj: Usj = {
        ...(editor.usj as Usj),
        content: (editor.usj as Usj).content.map(node =>
          typeof node !== 'string' && node.marker === 's1'
            ? { ...node, content: [change === 'edit' ? 'Edited title' : ''] }
            : node
        ),
      };
      act(() => {
        editor.usj = editedUsj;
        editor.commit?.(editedUsj);
      });

      const savedVerse: PericopeVerseText = {
        ...rows[1],
        markers: {
          paragraphs: rows[1].markers!.paragraphs,
          ...(change === 'edit' ? { headings: [{ marker: 's1', text: 'Edited title' }] } : {}),
        },
      };
      expect(onVersesChange).toHaveBeenCalledExactlyOnceWith([savedVerse]);

      // Rebuild from the emitted rows as navigation would after persistence. This does not mock
      // an API response: the assertion is limited to the wrappers' emitted and reloaded data.
      const savedRows = [rows[0], onVersesChange.mock.calls[0][0][0]];
      rerender(
        <Component
          {...props}
          contentKey='reloaded'
          verses={savedRows}
          onVersesChange={onVersesChange}
        />
      );
      expect(editor.load).toHaveBeenCalledExactlyOnceWith(pericopeVersesToUsj(savedRows, 1, 'GEN'));
      expect(editor.usj).toEqual(pericopeVersesToUsj(savedRows, 1, 'GEN'));
      expect(usjToPericopeVerses(editor.usj as Usj)).toEqual(savedRows);
      expect(onVersesChange).toHaveBeenCalledTimes(1);

      // An editor can serialize structural whitespace differently after a load. It is still the
      // same heading and scripture, so both the exact echo and this normalized echo must be quiet.
      act(() => editor.commit?.(editor.usj as Usj));
      const echoedUsj: Usj = {
        ...(editor.usj as Usj),
        content: (editor.usj as Usj).content.map(node =>
          typeof node !== 'string' && node.type === 'para'
            ? { ...node, content: [...(node.content ?? []), ' '] }
            : node
        ),
      };
      act(() => editor.commit?.(echoedUsj));
      expect(onVersesChange).toHaveBeenCalledTimes(1);
    }
  );
});
