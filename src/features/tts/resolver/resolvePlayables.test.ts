import { describe, expect, it, vi } from 'vitest';

import { TtsRecoveryStrategy } from '../strategies/ttsRecoveryStrategy';
import {
  bsbChapter,
  emptyChapter,
  raggedChapter,
  sourceChapterRequest,
  windowlessChapter,
} from '../testing/sourceAudioFixtures';

import { ChapterAudioCache } from './chapterCache';
import { resolvePlayables } from './resolvePlayables';

import type {
  RecordedRecoveryOptions,
  SourceAudioRow,
  SourceResolverContext,
} from './resolvePlayables';
import type {
  PlaybackRunState,
  RecoveryStrategy,
  Segment,
  SourceResolutionContext,
} from '../seam/types';

// Test-only class: task E supplies the real implementing strategy before any host can wire this resolver.
class RecordedPolicy implements RecoveryStrategy {
  readonly supervision = { stallWatchdogMs: null };
  readonly recover = vi.fn(async () => {});
  constructor(readonly options: RecordedRecoveryOptions) {}
}
const rows: SourceAudioRow[] = [1, 2, 3, 4].map(verseNumber => ({
  verseRef: String(verseNumber),
  verseNumber,
  text: `Source verse ${verseNumber}`,
  langCode: 'eng',
}));
const resolution = (run: PlaybackRunState = { forceTts: false }): SourceResolutionContext => ({
  signal: new AbortController().signal,
  run,
  requests: { attach: vi.fn(), markAi: vi.fn() },
});
const resolve = (segment: Segment, context = resolution()) => {
  if (typeof segment.source !== 'function') throw new Error('Expected lazy source');
  return segment.source(context);
};
const setup = (response = bsbChapter()) => {
  const load = vi.fn().mockResolvedValue(response);
  const synthesize = vi.fn().mockResolvedValue({ audioUrl: 'https://example.test/tts.wav' });
  const ctx: SourceResolverContext = {
    ...sourceChapterRequest,
    pageKey: 'page',
    cache: new ChapterAudioCache({ load, supportsOpus: true }),
    engine: { synthesize },
    recordedRecovery: RecordedPolicy,
    ttsLicenseStatus: response.ttsLicenseStatus,
    licenseNotice: response.licenseNotice,
  };
  return { ctx, load, synthesize };
};

describe('resolvePlayables', () => {
  it('does no I/O during construction; records all verses with one chapter lookup and no AI marking', async () => {
    const { ctx, load, synthesize } = setup();
    const playables = resolvePlayables(rows, ctx);
    expect(playables).toHaveLength(4);
    expect(load).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    for (const [index, playable] of playables.entries()) {
      const context = resolution();
      const source = await resolve(playable.segments[0], context);
      expect(source).toMatchObject({
        url: bsbChapter().items[1].url,
        window: [
          bsbChapter().verseTimestamps![index].startSeconds,
          bsbChapter().verseTimestamps![index].endSeconds,
        ],
        durationIsMeasured: true,
      });
      expect(context.requests.attach).toHaveBeenCalledWith(expect.any(RecordedPolicy));
      expect(context.requests.markAi).not.toHaveBeenCalled();
    }
    expect(load).toHaveBeenCalledOnce();
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('creates one pericope key with source rows in document order, not N verse keys', () => {
    const { ctx } = setup();
    const playables = resolvePlayables([rows[2], rows[0]], { ...ctx, pericopeId: 'section-1' });
    expect(playables).toHaveLength(1);
    expect(playables[0].segments.map(segment => segment.verseRef)).toEqual(['3', '1']);
    expect(playables[0].segments.every(segment => segment.playableKey === playables[0].key)).toBe(
      true
    );
    expect(resolvePlayables([], ctx)).toEqual([]);
    expect(resolvePlayables([], { ...ctx, pericopeId: 'empty' })).toEqual([]);
  });

  it('keys page and Bible identity, not text presence; verse and pericope identities cannot collide', async () => {
    const { ctx, synthesize } = setup();
    const [base] = resolvePlayables([rows[0]], ctx);
    const [audioOnly] = resolvePlayables([{ ...rows[0], text: null }], ctx);
    expect(audioOnly.key).toBe(base.key);
    expect(resolvePlayables([rows[0]], { ...ctx, bibleId: 99 })[0].key).not.toBe(base.key);
    expect(resolvePlayables([rows[0]], { ...ctx, pageKey: 'other' })[0].key).not.toBe(base.key);
    expect(resolvePlayables([rows[0]], { ...ctx, pericopeId: '1' })[0].key).not.toBe(base.key);
    await expect(resolve(audioOnly.segments[0])).resolves.toHaveProperty('window', [4.52, 10.32]);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it.each([windowlessChapter, emptyChapter])(
    'falls back to TTS on labelled windowless or empty responses',
    async fixture => {
      const { ctx, synthesize } = setup(fixture());
      const segments = resolvePlayables(rows, ctx).flatMap(playable => playable.segments);
      for (const segment of segments) {
        const context = resolution();
        expect(await resolve(segment, context)).toEqual({
          url: 'https://example.test/tts.wav',
          durationIsMeasured: false,
        });
        expect(context.requests.attach).toHaveBeenCalledWith(expect.any(TtsRecoveryStrategy));
        expect(context.requests.markAi).toHaveBeenCalledOnce();
      }
      expect(synthesize).toHaveBeenCalledTimes(4);
    }
  );

  it('keeps mixed capability: only an unwindowed verse is synthesized; the last lone start stays recorded', async () => {
    const { ctx, synthesize } = setup(raggedChapter());
    const run = { forceTts: false };
    const sources = [];
    const contexts = [];
    for (const playable of resolvePlayables(rows, { ...ctx, pericopeId: 'mixed' })) {
      for (const segment of playable.segments) {
        const context = resolution(run);
        contexts.push(context);
        sources.push(await resolve(segment, context));
      }
    }
    expect(sources.map(source => source.window)).toEqual([[5, 10], [10, 15], undefined, [20]]);
    expect(contexts.map(context => vi.mocked(context.requests.markAi).mock.calls.length)).toEqual([
      0, 0, 1, 0,
    ]);
    expect(synthesize).toHaveBeenCalledOnce();
    expect(run.forceTts).toBe(false);
  });

  it('reads the shared downgrade lazily across later playables, and a new run retries recorded audio', async () => {
    const { ctx, synthesize } = setup();
    const playables = resolvePlayables(rows, ctx);
    const run = { forceTts: false };
    expect(await resolve(playables[0].segments[0], resolution(run))).toHaveProperty('window');
    run.forceTts = true;
    for (const playable of playables.slice(1)) {
      const context = resolution(run);
      expect(await resolve(playable.segments[0], context)).not.toHaveProperty('window');
      expect(context.requests.markAi).toHaveBeenCalledOnce();
    }
    expect(await resolve(playables[1].segments[0], resolution())).toHaveProperty('window');
    expect(synthesize).toHaveBeenCalledTimes(3);
  });

  it('skips even chapter lookup when a resumed run is already downgraded', async () => {
    const { ctx, load } = setup();
    const context = resolution({ forceTts: true });
    await resolve(resolvePlayables(rows, ctx)[0].segments[0], context);
    expect(load).not.toHaveBeenCalled();
    expect(context.requests.markAi).toHaveBeenCalledOnce();
  });

  it('rechecks the run instruction after an in-flight chapter lookup', async () => {
    const { ctx, load, synthesize } = setup();
    let finish!: (value: ReturnType<typeof bsbChapter>) => void;
    load.mockReturnValue(
      new Promise(done => {
        finish = done;
      })
    );
    const run = { forceTts: false };
    const pending = resolve(resolvePlayables(rows, ctx)[0].segments[0], resolution(run));
    await Promise.resolve();
    run.forceTts = true;
    finish(bsbChapter());
    expect(await pending).not.toHaveProperty('window');
    expect(synthesize).toHaveBeenCalledOnce();
  });

  it('attaches a fresh recorded strategy per resolution, carrying the full heal identity and lazy TTS replacement', async () => {
    const { ctx, synthesize } = setup();
    const segment = resolvePlayables(rows, ctx)[0].segments[0];
    const a = resolution();
    const b = resolution();
    await resolve(segment, a);
    await resolve(segment, b);
    const first = vi.mocked(a.requests.attach).mock.calls[0][0] as RecordedPolicy;
    const second = vi.mocked(b.requests.attach).mock.calls[0][0] as RecordedPolicy;
    expect(first).not.toBe(second);
    expect(second.options).toMatchObject({
      chapter: sourceChapterRequest,
      cache: ctx.cache,
      verseNumber: 1,
    });
    expect(synthesize).not.toHaveBeenCalled();
    const replacement = resolution();
    await second.options.ttsSource(replacement);
    expect(replacement.requests.attach).toHaveBeenCalledWith(expect.any(TtsRecoveryStrategy));
    expect(replacement.requests.markAi).toHaveBeenCalledOnce();
  });

  it('falls back on a failed source-audio request, without changing the strict synthesis request', async () => {
    const { ctx, load, synthesize } = setup();
    load.mockRejectedValue(new Error('provider down'));
    const context = resolution();
    await resolve(resolvePlayables(rows, ctx)[0].segments[0], context);
    expect(synthesize).toHaveBeenCalledWith(
      { text: 'Source verse 1', langCode: 'eng' },
      context.signal
    );
    expect(context.requests.markAi).toHaveBeenCalledOnce();
  });

  it('never synthesizes missing text or substitutes target text when recording is unavailable', async () => {
    const { ctx, synthesize } = setup(emptyChapter());
    const context = resolution();
    const [playable] = resolvePlayables([{ ...rows[0], text: null }], ctx);
    await expect(resolve(playable.segments[0], context)).rejects.toThrow('No source text');
    expect(synthesize).not.toHaveBeenCalled();
    expect(context.requests.markAi).not.toHaveBeenCalled();
  });

  it('carries forbidden licence facts but leaves enforcement to phase 08', async () => {
    const chapter = windowlessChapter();
    chapter.ttsLicenseStatus = 'forbidden';
    const { ctx, synthesize } = setup(chapter);
    expect(ctx.ttsLicenseStatus).toBe('forbidden');
    await resolve(resolvePlayables(rows, ctx)[0].segments[0]);
    expect(synthesize).toHaveBeenCalledOnce();
  });

  it('cancels pending resolution without synthesizing, attaching or marking AI', async () => {
    const { ctx, load, synthesize } = setup();
    load.mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const context = { ...resolution(), signal: controller.signal };
    const pending = resolve(resolvePlayables(rows, ctx)[0].segments[0], context);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    await rejected;
    expect(synthesize).not.toHaveBeenCalled();
    expect(context.requests.attach).not.toHaveBeenCalled();
    expect(context.requests.markAi).not.toHaveBeenCalled();
  });
});
