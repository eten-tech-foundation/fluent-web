import { describe, expect, it } from 'vitest';

import {
  canSetPericopeTitle,
  getPericopeTitle,
  restorePericopeTitle,
  withoutPericopeTitle,
  withPericopeTitle,
} from '@/features/bible/lib/pericope-title';

const reference = { marker: 'r', text: '(Matthew 1:1)' };
const subtitle = { marker: 's2', text: 'A subtitle' };
const title = { marker: 's1', text: 'The section title' };
const paragraphs = [{ marker: 'p', offset: 0 }];

describe('pericope titles', () => {
  it('keeps references and subtitles when adding a missing title', () => {
    const markers = { headings: [reference, subtitle], paragraphs };
    expect(getPericopeTitle(markers)).toBeUndefined();
    expect(withoutPericopeTitle(markers)).toBe(markers);
    expect(withPericopeTitle(markers, title.text)).toEqual({
      headings: [title, reference, subtitle],
      paragraphs,
    });
    expect(markers.headings).toEqual([reference, subtitle]);
  });

  it.each(['s', 's1'])('edits only the %s title while preserving stored heading order', marker => {
    const markers = { headings: [reference, { ...title, marker }, subtitle], paragraphs };
    expect(getPericopeTitle(markers)).toEqual({ ...title, marker });
    expect(withPericopeTitle(markers, 'Edited title')).toEqual({
      headings: [reference, { marker, text: 'Edited title' }, subtitle],
      paragraphs,
    });
  });

  it('does not promote a reference or subtitle after clearing and rewriting the title', () => {
    const cleared = withPericopeTitle({ headings: [title, reference, subtitle], paragraphs }, '');
    expect(cleared).toEqual({ headings: [reference, subtitle], paragraphs });
    expect(getPericopeTitle(cleared)).toBeUndefined();
    expect(withPericopeTitle(cleared, 'Replacement')).toEqual({
      headings: [{ ...title, text: 'Replacement' }, reference, subtitle],
      paragraphs,
    });
  });

  it('round-trips the title around body edits without moving existing headings', () => {
    const original = { headings: [reference, title, subtitle], paragraphs };
    expect(withoutPericopeTitle(original)).toEqual({ headings: [reference, subtitle], paragraphs });
    const editedReference = { ...reference, text: '(Matthew 1:2)' };
    const editedParagraphs = [{ marker: 'q1', offset: 0 }];
    expect(
      restorePericopeTitle(
        { headings: [editedReference, subtitle], paragraphs: editedParagraphs },
        original
      )
    ).toEqual({ headings: [editedReference, title, subtitle], paragraphs: editedParagraphs });
  });

  it('keeps the title before its subtitle when a preceding reference is removed', () => {
    expect(
      restorePericopeTitle({ headings: [subtitle] }, { headings: [reference, title, subtitle] })
    ).toEqual({ headings: [title, subtitle] });
  });

  it('allows an existing title to change at the heading limit but blocks a fifth heading', () => {
    expect(canSetPericopeTitle({ headings: [reference, subtitle, reference, subtitle] })).toBe(
      false
    );
    expect(canSetPericopeTitle({ headings: [title, subtitle, reference, subtitle] })).toBe(true);
    expect(canSetPericopeTitle({ headings: [reference, subtitle, reference] })).toBe(true);
  });
});
