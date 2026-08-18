/**
 * Unit tests for the cross-page continuation token (T16, §5.3).
 *
 * The token is module state, so every test disarms first: a leaked arm would
 * make the NEXT test's page start playing, which is the exact production
 * failure this file exists to rule out.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  armTtsContinuation,
  claimTtsContinuation,
  disarmTtsContinuation,
  TTS_CONTINUATION_TTL_MS,
} from './playbackContinuation';

beforeEach(() => {
  disarmTtsContinuation();
});

describe('tts playback continuation', () => {
  it('claims nothing when nothing was armed', () => {
    expect(claimTtsContinuation('42')).toBe(false);
  });

  it('claims the page it was armed for', () => {
    armTtsContinuation('42');

    expect(claimTtsContinuation('42')).toBe(true);
  });

  it('is single-shot: a second mount of the same page stays silent', () => {
    armTtsContinuation('42');

    expect(claimTtsContinuation('42')).toBe(true);
    expect(claimTtsContinuation('42')).toBe(false);
  });

  it('refuses a page it was not armed for', () => {
    armTtsContinuation('42');

    expect(claimTtsContinuation('7')).toBe(false);
  });

  it('survives a mismatched claim — the OLD page asks before the new one exists', () => {
    armTtsContinuation('42');

    // The arming page re-renders (isContinuing flips) and asks with its own key.
    expect(claimTtsContinuation('41')).toBe(false);
    // The promised page must still be able to claim it.
    expect(claimTtsContinuation('42')).toBe(true);
  });

  it('expires, so a navigation that never landed cannot start a later visit', () => {
    armTtsContinuation('42', 1_000);

    expect(claimTtsContinuation('42', 1_000 + TTS_CONTINUATION_TTL_MS + 1)).toBe(false);
  });

  it('claims at the edge of the window', () => {
    armTtsContinuation('42', 1_000);

    expect(claimTtsContinuation('42', 1_000 + TTS_CONTINUATION_TTL_MS)).toBe(true);
  });

  it('disarms on demand — a failed navigation withdraws the promise', () => {
    armTtsContinuation('42');
    disarmTtsContinuation();

    expect(claimTtsContinuation('42')).toBe(false);
  });
});
