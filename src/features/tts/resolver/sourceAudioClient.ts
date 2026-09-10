import { z } from 'zod';

import { config } from '@/lib/config';

import type { FetchLike } from '../engines/serverTtsEngine';

// Mirror the additive source-audio wire contract, not the strict TTS request.
export const sourceAudioResponseSchema = z.object({
  provider: z.enum(['dbl', 'aquifer']),
  bible: z.object({
    aquiferBibleId: z.number().int().optional(),
    dblAudioBibleId: z.string().optional(),
    name: z.string(),
    abbreviation: z.string(),
    fluentBibleId: z.number().int().optional(),
  }),
  ttsLicenseStatus: z.enum(['allowed', 'forbidden', 'unknown']).optional(),
  licenseNotice: z.string().nullable().optional(),
  bookCode: z.string().regex(/^[A-Z0-9]{3}$/),
  chapter: z.number().int().positive(),
  verse: z.number().int().positive().optional(),
  items: z.array(
    z.object({
      format: z.enum(['mp3', 'webm']),
      url: z.string().url(),
      sizeBytes: z.number().int().nonnegative().optional(),
      // Parsed for wire fidelity, never read for selection or window closure.
      scope: z.enum(['chapter', 'verse']),
      durationSeconds: z.number().nonnegative().optional(),
      // Published for mobile; web heals reactively and never reads this value.
      expiresAt: z.number().optional(),
      dblAudioBibleId: z.string().optional(),
    })
  ),
  verseAddressable: z.boolean(),
  verseTimestamps: z
    .array(
      z.object({
        verse: z.number().int().positive(),
        startSeconds: z.number().nonnegative().optional(),
        endSeconds: z.number().nonnegative().optional(),
        dblAudioBibleId: z.string().optional(),
      })
    )
    .optional(),
});

export type ChapterSourceAudio = z.infer<typeof sourceAudioResponseSchema>;
export type SourceAudioTimestamp = NonNullable<ChapterSourceAudio['verseTimestamps']>[number];

export interface ChapterSourceAudioRequest {
  projectId: number;
  bookCode: string;
  chapter: number;
  bibleId: number;
  languageCode: string;
}

export interface SourceAudioClientOptions {
  apiBaseUrl?: string;
  fetchFn?: FetchLike;
}

export const fetchChapterSourceAudio = async (
  chapter: ChapterSourceAudioRequest,
  signal: AbortSignal,
  options: SourceAudioClientOptions = {}
): Promise<ChapterSourceAudio> => {
  signal.throwIfAborted();
  const base = options.apiBaseUrl ?? config.api.url;
  const query = new URLSearchParams({
    bibleId: String(chapter.bibleId),
    languageCode: chapter.languageCode,
  });
  const response = await (options.fetchFn ?? fetch)(
    `${base}/projects/${chapter.projectId}/source-audio/${encodeURIComponent(chapter.bookCode)}/${chapter.chapter}?${query}`,
    { method: 'GET', credentials: 'include', signal }
  );
  if (!response.ok) throw new Error(`Failed to resolve source audio (HTTP ${response.status})`);
  const parsed = sourceAudioResponseSchema.parse(await response.json());
  signal.throwIfAborted();
  return parsed;
};
