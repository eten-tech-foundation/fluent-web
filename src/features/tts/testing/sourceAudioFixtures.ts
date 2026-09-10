import { sourceAudioResponseSchema } from '../resolver/sourceAudioClient';

import capture from './fixtures/bsb-jhn3-source-audio.json';

import type { ChapterSourceAudio, ChapterSourceAudioRequest } from '../resolver/sourceAudioClient';

/** The actual authenticated phase-02 response, not a fabricated BSB capture. */
export const bsbChapter = (): ChapterSourceAudio =>
  sourceAudioResponseSchema.parse(capture.response);
export const sourceChapterRequest: ChapterSourceAudioRequest = {
  projectId: 1,
  bibleId: 2,
  bookCode: 'JHN',
  chapter: 3,
  languageCode: 'eng',
};

/** UNPROVEN: DBL ships no timecodes today (355/355 measured); contract-shaped only. */
export const unprovenDblChapter = (): ChapterSourceAudio => ({
  ...bsbChapter(),
  provider: 'dbl',
  bible: { name: 'Contract fixture', abbreviation: 'TEST', dblAudioBibleId: 'plain' },
  items: [
    {
      format: 'mp3',
      scope: 'chapter',
      url: 'https://example.test/plain.mp3',
      dblAudioBibleId: 'plain',
    },
    {
      format: 'mp3',
      scope: 'chapter',
      url: 'https://example.test/drama.mp3',
      dblAudioBibleId: 'drama',
    },
  ],
  verseTimestamps: [
    { verse: 1, startSeconds: 10, endSeconds: 20, dblAudioBibleId: 'drama' },
    { verse: 2, startSeconds: 20, endSeconds: 30, dblAudioBibleId: 'drama' },
  ],
});

export const windowlessChapter = (): ChapterSourceAudio => ({
  ...bsbChapter(),
  verseAddressable: false,
  verseTimestamps: undefined,
});
export const emptyChapter = (): ChapterSourceAudio => ({ ...windowlessChapter(), items: [] });
export const raggedChapter = (): ChapterSourceAudio => ({
  ...bsbChapter(),
  verseTimestamps: [
    { verse: 1, startSeconds: 5 },
    { verse: 2, startSeconds: 10, endSeconds: 15 },
    { verse: 3, endSeconds: 20 },
    { verse: 4, startSeconds: 20 },
  ],
});
