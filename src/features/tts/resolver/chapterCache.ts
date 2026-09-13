import { canBrowserPlayOpus } from '../engines/serverTtsEngine';

import { selectTrack } from './selectTrack';
import { fetchChapterSourceAudio } from './sourceAudioClient';

import type { ChapterSourceAudio, ChapterSourceAudioRequest } from './sourceAudioClient';

// Backstop only, below DBL's measured one-hour URL lifetime. No strategy reads a clock.
export const CHAPTER_AUDIO_BACKSTOP_MS = 45 * 60 * 1000;

export const chapterAudioKey = (chapter: ChapterSourceAudioRequest): string =>
  JSON.stringify([
    chapter.projectId,
    chapter.bibleId,
    chapter.bookCode,
    chapter.chapter,
    chapter.languageCode,
  ]);

type ChapterLoader = (
  chapter: ChapterSourceAudioRequest,
  signal: AbortSignal
) => Promise<ChapterSourceAudio>;

interface HeldChapter {
  response: ChapterSourceAudio;
  fetchedAt: number;
}
interface PendingChapter {
  controller: AbortController;
  promise: Promise<ChapterSourceAudio>;
  waiters: number;
}

/** Page-owned response dedupe, not a media store or an availability cache. */
export class ChapterAudioCache {
  readonly supportsOpus: boolean;
  private readonly held = new Map<string, HeldChapter>();
  private readonly pending = new Map<string, PendingChapter>();
  private readonly load: ChapterLoader;

  constructor(options: { load?: ChapterLoader; supportsOpus?: boolean } = {}) {
    this.load = options.load ?? fetchChapterSourceAudio;
    this.supportsOpus = options.supportsOpus ?? canBrowserPlayOpus();
  }

  /** Cheap knowledge only: never fetch just to decorate an idle control. */
  peek(chapter: ChapterSourceAudioRequest): ChapterSourceAudio | undefined {
    return this.held.get(chapterAudioKey(chapter))?.response;
  }

  get(chapter: ChapterSourceAudioRequest, signal: AbortSignal): Promise<ChapterSourceAudio> {
    signal.throwIfAborted();
    const key = chapterAudioKey(chapter);
    const pending = this.pending.get(key);
    if (pending) return this.join(key, pending, signal);
    const held = this.held.get(key);
    if (held && Date.now() - held.fetchedAt < CHAPTER_AUDIO_BACKSTOP_MS)
      return Promise.resolve(held.response);
    return this.fetch(chapter, signal);
  }

  heal(
    chapter: ChapterSourceAudioRequest,
    deadUrl: string,
    signal: AbortSignal
  ): Promise<ChapterSourceAudio> {
    signal.throwIfAborted();
    const key = chapterAudioKey(chapter);
    const pending = this.pending.get(key);
    if (pending) return this.join(key, pending, signal);
    const held = this.held.get(key);
    if (held && selectTrack(held.response, this.supportsOpus)?.item.url !== deadUrl)
      return Promise.resolve(held.response); // Another verse already healed this chapter.
    return this.fetch(chapter, signal);
  }

  /** The host binds this to page lifetime. A late completion cannot repopulate the cache. */
  clear(): void {
    this.held.clear();
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const entry of pending) entry.controller.abort();
  }

  private fetch(
    chapter: ChapterSourceAudioRequest,
    signal: AbortSignal
  ): Promise<ChapterSourceAudio> {
    const key = chapterAudioKey(chapter);
    this.held.delete(key);
    const controller = new AbortController();
    const entry: PendingChapter = {
      controller,
      waiters: 0,
      // Defer invocation so entry identity exists even for synchronous loader failures.
      promise: Promise.resolve()
        .then(async () => {
          controller.signal.throwIfAborted();
          const response = await this.load(chapter, controller.signal);
          controller.signal.throwIfAborted();
          if (this.pending.get(key) === entry)
            this.held.set(key, { response, fetchedAt: Date.now() });
          return response;
        })
        .finally(() => {
          if (this.pending.get(key) === entry) this.pending.delete(key);
        }),
    };
    this.pending.set(key, entry);
    return this.join(key, entry, signal);
  }

  private join(
    key: string,
    entry: PendingChapter,
    signal: AbortSignal
  ): Promise<ChapterSourceAudio> {
    entry.waiters++;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (action: () => void) => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', cancel);
        entry.controller.signal.removeEventListener('abort', cancel);
        entry.waiters--;
        if (!entry.waiters && this.pending.get(key) === entry) {
          this.pending.delete(key);
          entry.controller.abort();
        }
        action();
      };
      const cancel = () =>
        finish(() => reject(signal.aborted ? signal.reason : entry.controller.signal.reason));
      signal.addEventListener('abort', cancel, { once: true });
      entry.controller.signal.addEventListener('abort', cancel, { once: true });
      // Always observe both outcomes, even if cancellation wins the race.
      entry.promise.then(
        response => finish(() => resolve(response)),
        error => finish(() => reject(error))
      );
      if (signal.aborted || entry.controller.signal.aborted) cancel();
    });
  }
}
