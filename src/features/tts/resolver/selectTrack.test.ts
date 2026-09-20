import { describe, expect, it } from 'vitest';

import {
  bsbChapter,
  emptyChapter,
  raggedChapter,
  unprovenDblChapter,
  windowlessChapter,
} from '../testing/sourceAudioFixtures';

import { recordedSourceForVerse, recordingProvenance, selectTrack } from './selectTrack';

describe('selectTrack', () => {
  it.each([true, false])(
    'chooses Aquifer codec using the shared capability result: Opus=%s',
    supportsOpus => {
      const chapter = bsbChapter();
      expect(selectTrack(chapter, supportsOpus)?.item).toBe(chapter.items[supportsOpus ? 1 : 0]);
    }
  );

  it('uses mp3 when it is the only Aquifer encoding, even under Opus support', () => {
    const chapter = bsbChapter();
    chapter.items = [chapter.items[0]];
    expect(selectTrack(chapter, true)?.item.format).toBe('mp3');
    chapter.items = [bsbChapter().items[1]];
    expect(selectTrack(chapter, false)).toBeUndefined();
  });

  // UNPROVEN: DBL timecodes are contract-shaped, not live evidence (355/355 absent).
  it('selects the second DBL track when it alone owns timestamps', () => {
    const chapter = unprovenDblChapter();
    expect(selectTrack(chapter, true)?.item).toBe(chapter.items[1]);
    expect(recordedSourceForVerse(chapter, 1, false)).toMatchObject({
      url: chapter.items[1].url,
      window: [10, 20],
      durationMs: 10000,
    });
  });

  it('uses the server primary when multiple DBL tracks qualify; never borrows other windows', () => {
    const chapter = unprovenDblChapter();
    chapter.verseTimestamps!.push({
      verse: 1,
      startSeconds: 1,
      endSeconds: 3,
      dblAudioBibleId: 'plain',
    });
    expect(selectTrack(chapter, true)?.item).toBe(chapter.items[0]);
    expect(recordedSourceForVerse(chapter, 1, true)?.window).toEqual([1, 3]);
    expect(recordedSourceForVerse(chapter, 2, true)).toBeUndefined();
  });

  it('uses the server primary when no track owns timestamps, without adopting untagged entries', () => {
    const chapter = unprovenDblChapter();
    chapter.verseTimestamps = [{ verse: 1, startSeconds: 1, endSeconds: 2 }];
    expect(selectTrack(chapter, false)?.item).toBe(chapter.items[0]);
    expect(recordedSourceForVerse(chapter, 1, false)).toBeUndefined();
  });

  it('returns no recording for empty or explicitly windowless chapters even with timestamps present', () => {
    expect(selectTrack(emptyChapter(), true)).toBeUndefined();
    const chapter = windowlessChapter();
    chapter.verseTimestamps = bsbChapter().verseTimestamps;
    expect(recordedSourceForVerse(chapter, 1, true)).toBeUndefined();
  });

  it('returns recorded open-ended audio, without claiming a measured duration', () => {
    expect(recordedSourceForVerse(raggedChapter(), 4, true)).toMatchObject({
      window: [20],
      durationMs: undefined,
      durationIsMeasured: false,
    });
  });

  it('ignores scope, provider duration and expiry when deriving a source', () => {
    const chapter = bsbChapter();
    const expected = recordedSourceForVerse(chapter, 36, true);
    chapter.items = chapter.items.map(item => ({
      ...item,
      scope: 'verse',
      durationSeconds: 99999,
      expiresAt: 0,
    }));
    expect(recordedSourceForVerse(chapter, 36, true)).toEqual(expected);
  });

  it('reselects the recording and replaces the entire source on a fresh response', () => {
    const chapter = unprovenDblChapter();
    const before = recordedSourceForVerse(chapter, 1, false);
    chapter.verseTimestamps = [
      { verse: 1, startSeconds: 1, endSeconds: 3, dblAudioBibleId: 'plain' },
    ];
    const after = recordedSourceForVerse(chapter, 1, false);
    expect(before).toMatchObject({ url: chapter.items[1].url, window: [10, 20] });
    expect(after).toMatchObject({ url: chapter.items[0].url, window: [1, 3] });
  });

  it('uses the selected DBL item name, or its exact identity when the direct response name is blank', () => {
    const chapter = unprovenDblChapter();
    chapter.bible.name = '';
    chapter.items = [
      {
        ...chapter.items[1],
        recordingKey: 'dbl-drama-audio',
        recordingName: 'Drama Audio Bible',
      },
    ];
    const named = recordedSourceForVerse(chapter, 1, false)!;
    expect(recordingProvenance(named)).toMatchObject({
      recordingKey: 'dbl-drama-audio',
      recordingName: 'Drama Audio Bible',
    });
    delete chapter.items[0].recordingName;
    const identityFallback = recordedSourceForVerse(chapter, 1, false)!;
    expect(recordingProvenance(identityFallback)).toMatchObject({
      recordingKey: 'dbl-drama-audio',
      recordingName: 'dbl-drama-audio',
    });
  });

  it('tracks the actual linked DBL item across multiple audio Bibles and recovery', () => {
    const chapter = unprovenDblChapter();
    chapter.bible.name = 'Text Bible name must not leak';
    chapter.items[0].recordingKey = 'dbl-plain-audio';
    chapter.items[1].recordingKey = 'dbl-drama-audio';
    const drama = recordedSourceForVerse(chapter, 1, false)!;
    expect(recordingProvenance(drama)?.recordingName).toBe('dbl-drama-audio');

    chapter.verseTimestamps = [
      { verse: 1, startSeconds: 1, endSeconds: 3, dblAudioBibleId: 'plain' },
    ];
    const healed = recordedSourceForVerse(chapter, 1, false)!;
    expect(recordingProvenance(healed)).toMatchObject({
      recordingKey: 'dbl-plain-audio',
      recordingName: 'dbl-plain-audio',
    });
  });
});
