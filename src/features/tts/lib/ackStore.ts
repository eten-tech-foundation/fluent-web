import { z } from 'zod';

const recordedNoticeSchema = z.object({
  textBibleKey: z.string().min(1),
  textBibleName: z.string().min(1),
  recordingKey: z.string().min(1),
  recordingName: z.string().min(1),
  recordingProvider: z.enum(['aquifer', 'dbl', 'youversion']),
  notice: z.string().refine(value => value.trim().length > 0),
});

/** Display data is stored with the exact identities so phase 09 can list and reopen notices. */
export type RecordedNotice = z.infer<typeof recordedNoticeSchema>;

export const recordedNoticeKey = (notice: RecordedNotice): string =>
  JSON.stringify([notice.textBibleKey, notice.recordingKey, notice.notice]);

const entrySchema = z.object({
  notice: recordedNoticeSchema,
  acknowledgedAt: z.string().datetime(),
});
export type RecordedNoticeAcknowledgment = z.infer<typeof entrySchema>;

const prefix = 'fluent.audio.recorded-notice.';

export function createRecordedNoticeAckStore(storage?: Storage) {
  const getStorage = (): Storage | undefined => {
    if (storage) return storage;
    try {
      return globalThis.localStorage;
    } catch {
      return undefined;
    }
  };
  const memory = new Map<string, RecordedNoticeAcknowledgment>();
  const read = (key: string): RecordedNoticeAcknowledgment | undefined => {
    const held = memory.get(key);
    if (held) return held;
    try {
      const raw = getStorage()?.getItem(prefix + key);
      if (!raw) return undefined;
      const parsed = entrySchema.safeParse(JSON.parse(raw));
      if (parsed.success && recordedNoticeKey(parsed.data.notice) === key) return parsed.data;
    } catch {
      // Private/denied/full storage and malformed old entries fall back to memory.
    }
    return undefined;
  };

  return {
    isAcknowledged(notice: RecordedNotice): boolean {
      return read(recordedNoticeKey(notice)) !== undefined;
    },
    acknowledge(notice: RecordedNotice): void {
      const parsed = recordedNoticeSchema.safeParse(notice);
      if (!parsed.success) return;
      const key = recordedNoticeKey(parsed.data);
      const entry = { notice: parsed.data, acknowledgedAt: new Date().toISOString() };
      memory.set(key, entry);
      try {
        getStorage()?.setItem(prefix + key, JSON.stringify(entry));
      } catch {
        // The session-memory entry still prevents repeated interruption.
      }
    },
    list(): RecordedNoticeAcknowledgment[] {
      const found = new Map(memory);
      try {
        const available = getStorage();
        for (let index = 0; index < (available?.length ?? 0); index += 1) {
          const storageKey = available?.key(index);
          if (!storageKey?.startsWith(prefix)) continue;
          const key = storageKey.slice(prefix.length);
          const entry = read(key);
          if (entry) found.set(key, entry);
        }
      } catch {
        // Return session-memory entries when enumeration is unavailable.
      }
      return [...found.values()].sort((a, b) => b.acknowledgedAt.localeCompare(a.acknowledgedAt));
    },
  };
}

export const recordedNoticeAckStore = createRecordedNoticeAckStore();
