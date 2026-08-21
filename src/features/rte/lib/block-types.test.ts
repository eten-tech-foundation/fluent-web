import { describe, expect, it } from 'vitest';

import { blockKindOf, indentedMarker, levelOf, markerFor, outdentedMarker } from './block-types';

describe('blockKindOf', () => {
  it('classifies the three authorable kinds', () => {
    expect(blockKindOf('p')).toBe('paragraph');
    expect(blockKindOf('s1')).toBe('heading');
    expect(blockKindOf('q1')).toBe('poetry');
  });

  it('reads bare \\s and \\q as their level-1 forms', () => {
    expect(blockKindOf('s')).toBe('heading');
    expect(blockKindOf('q')).toBe('poetry');
    expect(levelOf('s')).toBe(1);
    expect(levelOf('q')).toBe(1);
  });

  it('leaves markers the bar cannot author as "other" rather than mislabelling them', () => {
    // Imported content carries these; the editor preserves them, and the bar must not claim the
    // translator chose a paragraph when the cursor is in a major section head or a list item.
    for (const marker of ['ms', 'ms1', 'li2', 'tr', 'mi', 'pi2']) {
      expect(blockKindOf(marker)).toBe('other');
    }
  });

  it('counts poetry the bar cannot author as "other" too', () => {
    // `markerFor` only ever writes \q1 and \q2, so calling a \q3 line poetry would hand the bar
    // controls that can only resolve it to a level it did not have.
    expect(blockKindOf('q3')).toBe('other');
    expect(blockKindOf('q4')).toBe('other');
    expect(levelOf('q3')).toBeUndefined();
  });

  it('treats no cursor as prose', () => {
    expect(blockKindOf(undefined)).toBe('paragraph');
    expect(levelOf(undefined)).toBeUndefined();
  });
});

describe('markerFor', () => {
  it('builds the marker for a kind and level', () => {
    expect(markerFor('paragraph')).toBe('p');
    expect(markerFor('heading')).toBe('s1');
    expect(markerFor('heading', 3)).toBe('s3');
    expect(markerFor('poetry')).toBe('q1');
    expect(markerFor('poetry', 2)).toBe('q2');
  });

  it('clamps levels to what the ticket authorises', () => {
    expect(markerFor('heading', 9)).toBe('s4');
    expect(markerFor('heading', 0)).toBe('s1');
    expect(markerFor('poetry', 4)).toBe('q2');
  });
});

describe('indent controls', () => {
  it('moves poetry between the two indent levels', () => {
    expect(indentedMarker('q1')).toBe('q2');
    expect(outdentedMarker('q2')).toBe('q1');
  });

  it('outdenting a first-level poetry line makes it a paragraph', () => {
    expect(outdentedMarker('q1')).toBe('p');
  });

  it('has no effect outside poetry, so the controls can stay hidden there', () => {
    for (const marker of ['p', 's1', 'ms', undefined]) {
      expect(indentedMarker(marker)).toBeUndefined();
      expect(outdentedMarker(marker)).toBeUndefined();
    }
  });

  it('leaves an imported poetry level deeper than the bar authors alone', () => {
    // Outdenting \q4 once has no answer in a two-level bar: it would have to resolve to \q2 and
    // lose two levels of the imported indent that nobody asked to change.
    for (const marker of ['q3', 'q4']) {
      expect(indentedMarker(marker)).toBeUndefined();
      expect(outdentedMarker(marker)).toBeUndefined();
    }
  });

  it('does not indent past the deepest authorable level', () => {
    expect(indentedMarker('q2')).toBeUndefined();
  });
});
