import { describe, expect, it } from 'vitest';

import {
  buildTtsQueueItems,
  findTtsQueueIndex,
  isPlayableRow,
  type TtsRowDraft,
} from './buildTtsQueueItems';

describe('isPlayableRow', () => {
  it('treats missing, null, and whitespace-only text as unplayable (§5.1)', () => {
    expect(isPlayableRow({ verseRef: 'GEN 1:1' })).toBe(false);
    expect(isPlayableRow({ verseRef: 'GEN 1:1', text: null })).toBe(false);
    expect(isPlayableRow({ verseRef: 'GEN 1:1', text: '' })).toBe(false);
    expect(isPlayableRow({ verseRef: 'GEN 1:1', text: '   \n\t ' })).toBe(false);
  });

  it('treats any non-whitespace text as playable', () => {
    expect(isPlayableRow({ verseRef: 'GEN 1:1', text: 'In the beginning' })).toBe(true);
  });
});

describe('buildTtsQueueItems', () => {
  it('preserves the document order the host handed in', () => {
    const rows: TtsRowDraft[] = [
      { verseRef: 'GEN 1:1', text: 'one' },
      { verseRef: 'GEN 1:2', text: 'two' },
      { verseRef: 'GEN 1:3', text: 'three' },
    ];

    expect(buildTtsQueueItems(rows).map(item => item.verseRef)).toEqual([
      'GEN 1:1',
      'GEN 1:2',
      'GEN 1:3',
    ]);
  });

  it('drops unplayable rows instead of ending the listen at the gap (§5.3 step 5)', () => {
    // Panel 2 legitimately has holes: the reference Bible may not carry v2.
    const rows: TtsRowDraft[] = [
      { verseRef: 'GEN 1:1', text: 'one' },
      { verseRef: 'GEN 1:2', text: null },
      { verseRef: 'GEN 1:3', text: 'three' },
    ];

    expect(buildTtsQueueItems(rows).map(item => item.verseRef)).toEqual(['GEN 1:1', 'GEN 1:3']);
  });

  it('trims the text it sends to the engine', () => {
    const items = buildTtsQueueItems([{ verseRef: 'GEN 1:1', text: '  In the beginning  ' }]);

    expect(items[0].text).toBe('In the beginning');
  });

  it('includes langCode when known (T18)', () => {
    const items = buildTtsQueueItems([{ verseRef: 'GEN 1:1', text: 'one', langCode: 'ell' }]);

    expect(items[0].langCode).toBe('ell');
  });

  it('carries panel provenance through to the item (T17)', () => {
    const items = buildTtsQueueItems([
      { verseRef: 'GEN 1:1', text: 'one', audioSource: 'projectSource' },
      { verseRef: 'GEN 1:2', text: 'two' },
    ]);

    expect(items[0].audioSource).toBe('projectSource');
    expect('audioSource' in items[1]).toBe(false);
  });

  it('omits langCode entirely rather than sending a guess or an empty string (T18)', () => {
    const [unknown, blank] = buildTtsQueueItems([
      { verseRef: 'GEN 1:1', text: 'one' },
      { verseRef: 'GEN 1:2', text: 'two', langCode: '' },
    ]);

    expect('langCode' in unknown).toBe(false);
    expect('langCode' in blank).toBe(false);
  });
});

describe('findTtsQueueIndex', () => {
  it('resolves the start index in the filtered list, not the rendered row position', () => {
    // Row 3 is the third row on screen but only the second playable item; a
    // host that counted rendered rows would start "play from here" on v4.
    const items = buildTtsQueueItems([
      { verseRef: 'GEN 1:1', text: 'one' },
      { verseRef: 'GEN 1:2', text: '   ' },
      { verseRef: 'GEN 1:3', text: 'three' },
      { verseRef: 'GEN 1:4', text: 'four' },
    ]);

    expect(findTtsQueueIndex(items, 'GEN 1:3')).toBe(1);
    expect(items.slice(findTtsQueueIndex(items, 'GEN 1:3')).map(item => item.verseRef)).toEqual([
      'GEN 1:3',
      'GEN 1:4',
    ]);
  });

  it('returns -1 for a verse that is not in the queue', () => {
    const items = buildTtsQueueItems([{ verseRef: 'GEN 1:1', text: 'one' }]);

    expect(findTtsQueueIndex(items, 'GEN 1:2')).toBe(-1);
  });
});
