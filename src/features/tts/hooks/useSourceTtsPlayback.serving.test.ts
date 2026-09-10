/** Serving-wash coverage moved out of the provenance-blind queue to its TTS host. */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FakeClipElement } from '../testing/fakeClipElement';

import { useSourceTtsPlayback } from './useSourceTtsPlayback';

import type * as audioElementModule from '../lib/audioElement';
import type { TtsEngine, TtsServedFormat } from '../tts.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, text: string) => text }),
}));
vi.mock('../lib/audioElement', async importOriginal => ({
  ...(await importOriginal<typeof audioElementModule>()),
  createClipAudioElement: (src: string) => {
    const element = new FakeClipElement();
    element.src = src;
    return element;
  },
}));

const setup = (served: Array<TtsServedFormat | undefined>) => {
  let call = 0;
  const engine: TtsEngine = {
    synthesize: async () => ({ audioUrl: 'https://media.test/audio', servedAs: served[call++] }),
  };
  return renderHook(() =>
    useSourceTtsPlayback({
      engine,
      rows: [{ verseRef: 'v1', verseNumber: 1, text: 'Source text' }],
      sourceChapter: null,
      getRowElement: () => null,
      getViewport: () => null,
    })
  );
};

describe('useSourceTtsPlayback — which container served each clip', () => {
  it('records the container the clip was served as', async () => {
    const { result } = setup(['ogg']);
    await act(async () => result.current.playVerse('v1'));
    expect(result.current.servingFor('v1')).toBe('ogg');
  });

  it('reports the new container when the same verse is served from the bucket later', async () => {
    const { result } = setup(['wav', 'ogg']);
    await act(async () => result.current.playVerse('v1'));
    expect(result.current.servingFor('v1')).toBe('wav');
    await act(async () => result.current.playVerse('v1'));
    expect(result.current.servingFor('v1')).toBe('ogg');
  });

  it('keeps no note once playback goes idle', async () => {
    const { result } = setup(['ogg']);
    await act(async () => result.current.playVerse('v1'));
    expect(result.current.servingFor('v1')).toBe('ogg');
    act(() => result.current.stop());
    expect(result.current.servingFor('v1')).toBeUndefined();
  });

  it('says nothing when the engine names no container', async () => {
    const { result } = setup([undefined]);
    await act(async () => result.current.playVerse('v1'));
    expect(result.current.servingFor('v1')).toBeUndefined();
  });
});
