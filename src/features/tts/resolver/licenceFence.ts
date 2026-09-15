import { type TFunction } from 'i18next';

import { Logger } from '@/lib/services/logger';

import { chapterAudioKey } from './chapterCache';
import { recordedSourceForVerse } from './selectTrack';

import type { ChapterAudioCache } from './chapterCache';
import type { ChapterSourceAudio, ChapterSourceAudioRequest } from './sourceAudioClient';

/**
 * The licence fence: the one place a Bible's TTS licence status is read.
 *
 * It is a UX affordance and an ops record, not a legal control. The synthesis
 * request stays Bible-blind — no Bible id is sent with it, nothing is
 * authorized or tokenized here, and none of this hides text a screen reader
 * can already speak. What the fence enforces is narrower and achievable: the
 * app never *asks* for speech on a Bible nobody has cleared.
 *
 * Two product requirements are honoured by this single branch, with no
 * language list and no legal judgement in the client:
 *
 *   - Synthesis is scoped to Bibles a human has cleared. A Bible nobody has
 *     looked at is `unknown`, and `unknown` bars synthesis, so material in
 *     languages we have not licensed is out of scope by default rather than
 *     by enumeration.
 *   - Copyrighted material is never synthesized: `forbidden` and `unknown`
 *     both bar it. Only an explicit `allowed` opens the rung.
 *
 * An absent status bars synthesis too. A status we could not read is not a
 * clearance — but it is also not a fact about the Bible, so it is reported
 * separately from the two recorded states and never latched onto a control.
 */
export type LicenceBar = 'forbidden' | 'unknown' | 'unconfirmed';

/** Null means synthesis is permitted. `allowed` is the only opening value. */
export const licenceBar = (
  status: ChapterSourceAudio['ttsLicenseStatus'] | undefined
): LicenceBar | null => {
  switch (status) {
    case 'allowed':
      return null;
    case 'forbidden':
      return 'forbidden';
    case 'unknown':
      return 'unknown';
    default:
      return 'unconfirmed';
  }
};

/**
 * The reason a listener reads. The two barred states differ only here: the
 * distinction between "we decided no" and "nobody looked" exists for the
 * backlog query, not for the translator, who simply cannot hear this verse.
 */
export const licenceBarReason = (t: TFunction, bar: LicenceBar): string => {
  switch (bar) {
    case 'forbidden':
      return t('ttsLicenceForbidden', 'Text-to-speech is not permitted for this Bible.');
    case 'unknown':
      return t('ttsLicenceUnknown', 'Text-to-speech has not been cleared for this Bible.');
    case 'unconfirmed':
      return t(
        'ttsLicenceUnconfirmed',
        "This Bible's audio licence could not be confirmed. Please try again."
      );
  }
};

/** A recording failed where synthesis cannot follow it. The recording may work next time. */
export const recordedFailedBarredReason = (t: TFunction): string =>
  t(
    'ttsRecordedFailedLicence',
    'Recorded audio failed, and text-to-speech is not permitted for this Bible.'
  );

export interface LicenceVerdict {
  /** Null when synthesis is permitted for this chapter's Bible. */
  bar: LicenceBar | null;
  /** True when this verse can still be heard as a recording despite the bar. */
  recorded: boolean;
}

/**
 * What a host may say about one verse from knowledge it already holds. Does no
 * I/O. The assignment's status is preferred over the chapter response's copy:
 * both come from the same Bible row, but only the assignment's survives an
 * audio provider being unreachable.
 */
export const licenceVerdictForVerse = (
  response: ChapterSourceAudio | undefined,
  verseNumber: number,
  supportsOpus: boolean,
  assignedStatus?: ChapterSourceAudio['ttsLicenseStatus']
): LicenceVerdict => ({
  bar: licenceBar(assignedStatus ?? response?.ttsLicenseStatus),
  recorded:
    response !== undefined &&
    recordedSourceForVerse(response, verseNumber, supportsOpus) !== undefined,
});

/** A windowless chapter earns an AI badge only when speech is actually permitted. */
export const knownChapterTts = (
  response: ChapterSourceAudio | undefined,
  assignedStatus?: ChapterSourceAudio['ttsLicenseStatus']
): boolean =>
  response?.verseAddressable === false &&
  licenceBar(assignedStatus ?? response.ttsLicenseStatus) === null;

/** All supplied verses must be permanently unavailable to bar the whole playable. */
export const impossibleLicenceReason = (
  t: TFunction,
  response: ChapterSourceAudio | undefined,
  verseNumbers: readonly number[],
  supportsOpus: boolean,
  assignedStatus?: ChapterSourceAudio['ttsLicenseStatus']
): string | null => {
  const bar = licenceBar(assignedStatus ?? response?.ttsLicenseStatus);
  if (!response || bar === null || bar === 'unconfirmed' || verseNumbers.length === 0) return null;
  return verseNumbers.every(verse => !recordedSourceForVerse(response, verse, supportsOpus))
    ? licenceBarReason(t, bar)
    : null;
};

// One line per barred chapter per page, not per verse: the record an operator
// needs to tell a deliberate bar from a flag that was set wrong. Keyed by the
// cache the page's responses live in, so it dies with them.
const logged = new WeakMap<ChapterAudioCache, Set<string>>();

/** Reports a barred chapter once. An unconfirmed status is not an ops fact. */
export const noteLicenceBar = (
  cache: ChapterAudioCache,
  pageKey: string,
  chapter: ChapterSourceAudioRequest,
  response: ChapterSourceAudio | undefined,
  assignedStatus?: ChapterSourceAudio['ttsLicenseStatus']
): void => {
  const status = assignedStatus ?? response?.ttsLicenseStatus;
  const bar = licenceBar(status);
  if (response === undefined || bar === null || bar === 'unconfirmed') return;
  let seen = logged.get(cache);
  if (!seen) {
    seen = new Set<string>();
    logged.set(cache, seen);
  }
  const token = `${pageKey}|${chapterAudioKey(chapter)}`;
  if (seen.has(token)) return;
  seen.add(token);
  Logger.warn('Source text-to-speech barred by the licence fence', {
    fluentBibleId: response.bible.fluentBibleId,
    bookCode: response.bookCode,
    chapter: response.chapter,
    ttsLicenseStatus: status,
    verseAddressable: response.verseAddressable,
  });
};

/** Tests only: the once-per-chapter latch is otherwise invisible. */
export const resetLicenceBarLog = (cache: ChapterAudioCache): void => {
  logged.delete(cache);
};
