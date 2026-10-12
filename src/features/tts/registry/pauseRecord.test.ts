import { describe, expect, it } from 'vitest';

import { writeRecord } from './pauseRecord';
import { PlaybackRegistryStore } from './PlaybackRegistryStore';

const snapshot = {
  playableKey: 'verse-2',
  itemIndex: 0,
  verseRef: 'v2',
  currentTime: 12.75,
  forceTts: true,
};
const setup = () => new PlaybackRegistryStore(new Set());

describe('pause records', () => {
  it('stores element time verbatim, including file-absolute recorded offsets', () => {
    const store = setup();
    writeRecord(store, snapshot);
    expect(store.getRecord('verse-2')).toEqual({
      itemIndex: 0,
      verseRef: 'v2',
      currentTime: 12.75,
      forceTts: true,
    });
    expect(store.canRestart('verse-2')).toBe(true);
  });

  it('stores an explicit first-segment zero position and its recovery policy', () => {
    const store = setup();
    writeRecord(store, snapshot);
    writeRecord(store, { ...snapshot, currentTime: 0 });
    expect(store.getRecord('verse-2')).toEqual({
      itemIndex: 0,
      verseRef: 'v2',
      currentTime: 0,
      forceTts: true,
    });
    expect(store.canRestart('verse-2')).toBe(true);
  });

  it('zero time on a later segment is a real position', () => {
    const store = setup();
    writeRecord(store, { ...snapshot, itemIndex: 2, currentTime: 0 });
    expect(store.getRecord('verse-2')?.itemIndex).toBe(2);
  });

  it('keeps a fractional scrub at the first segment without converting it to time', () => {
    const store = setup();
    writeRecord(store, { ...snapshot, currentTime: 0, pendingFraction: 0.625 });
    expect(store.getRecord('verse-2')).toMatchObject({
      itemIndex: 0,
      currentTime: 0,
      pendingFraction: 0.625,
    });
  });

  it('survives displacement and same-page updates but drops on a page change', () => {
    const store = setup();
    store.setPageKey('chapter-1');
    store.claim(() => writeRecord(store, snapshot));
    store.claim(() => {});
    store.setPageKey('chapter-1');
    expect(store.getRecord('verse-2')?.forceTts).toBe(true);
    store.setPageKey('chapter-2');
    expect(store.getRecord('verse-2')).toBeNull();
  });
});
