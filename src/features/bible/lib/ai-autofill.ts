import { type TargetVerse } from '@/lib/types';

export interface AiAutoFill {
  verseNumber: number;
  text: string;
}

interface PendingAiAutoFillsArgs {
  /** The verses that may receive a suggestion right now, in the order they should be written. */
  candidateVerseNumbers: number[];
  verses: TargetVerse[];
  /** Suggestions available so far, by verse number. */
  suggestions: Record<number, string>;
  /** Verses the translator has typed in, or that were auto-populated already. */
  touchedVerseNumbers: ReadonlySet<number>;
}

/**
 * The AI suggestions that should be written into the draft on this pass.
 *
 * Suggestions stay per verse — the generation side is unchanged (chadw-eten on #400). What differs
 * between the two drafting surfaces is how many verses may receive one at a time: the textarea
 * path shows one verse at a time and fills only the verse in focus, while the pericope rich text
 * surface shows the whole pericope, so it takes every verse of it and populates progressively as
 * each suggestion becomes available. With generation running three verses ahead, that means the
 * first verses appear together and each later one lands as it is ready.
 *
 * A verse is filled only while it is still empty and untouched, so neither text the translator
 * wrote nor a suggestion already delivered is ever overwritten.
 */
export const pendingAiAutoFills = ({
  candidateVerseNumbers,
  verses,
  suggestions,
  touchedVerseNumbers,
}: PendingAiAutoFillsArgs): AiAutoFill[] =>
  candidateVerseNumbers.flatMap(verseNumber => {
    if (touchedVerseNumbers.has(verseNumber)) return [];

    const suggestion = suggestions[verseNumber];
    if (!suggestion) return [];

    const target = verses.find(verse => verse.verseNumber === verseNumber);
    if (!target || target.content.trim()) return [];

    return [{ verseNumber, text: suggestion }];
  });
