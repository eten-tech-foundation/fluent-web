import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { recordedNoticeAckStore } from '../lib/ackStore';

import { useRecordedNotice, type UseRecordedNoticeOptions } from './useRecordedNotice';

const recording = {
  recordingKey: 'aq-hook',
  recordingName: 'Recorded Bible',
  recordingProvider: 'aquifer' as const,
  notice: 'Hook notice.',
  playableKey: 'group-1',
};
const base: UseRecordedNoticeOptions = {
  scopeKey: 'source',
  textBibleKey: 'dbl-text-hook',
  textBibleName: 'Text Bible',
  recording,
  isPlaying: false,
  enabled: true,
};

beforeEach(() => localStorage.clear());

describe('recorded notice lifecycle', () => {
  it('opens on first sound, remains available while paused, and clears on TTS', () => {
    const h = renderHook(props => useRecordedNotice(props), { initialProps: base });
    expect(h.result.current.dialog).toBeNull();
    h.rerender({ ...base, isPlaying: true });
    expect(h.result.current.dialog?.recordingKey).toBe('aq-hook');
    h.rerender({ ...base, isPlaying: false });
    expect(h.result.current.infoFor('group-1')?.notice).toBe('Hook notice.');
    h.rerender({ ...base, recording: null, isPlaying: true });
    expect(h.result.current.dialog).toBeNull();
    expect(h.result.current.infoFor('group-1')).toBeNull();
  });

  it('acknowledges only an explicit close and then suppresses the same exact pair', () => {
    const props: UseRecordedNoticeOptions = {
      ...base,
      textBibleKey: 'dbl-close-hook',
      recording: { ...recording, notice: 'Close-only hook notice.' },
      isPlaying: true,
    };
    const h = renderHook(input => useRecordedNotice(input), { initialProps: props });
    expect(h.result.current.dialog).not.toBeNull();
    act(() => h.result.current.close());
    expect(recordedNoticeAckStore.isAcknowledged(h.result.current.infoFor('group-1')!)).toBe(true);
    h.rerender({ ...props, isPlaying: false });
    h.rerender(props);
    expect(h.result.current.dialog).toBeNull();
  });

  it('dismisses selection changes without acknowledging and opens edited fresh facts while sounding', () => {
    const props: UseRecordedNoticeOptions = {
      ...base,
      textBibleKey: 'dbl-edit-hook',
      recording: { ...recording, notice: 'Original edit hook.' },
      isPlaying: true,
    };
    const h = renderHook(input => useRecordedNotice(input), { initialProps: props });
    const original = h.result.current.dialog!;
    h.rerender({ ...props, scopeKey: 'reference', recording: null });
    expect(h.result.current.dialog).toBeNull();
    expect(recordedNoticeAckStore.isAcknowledged(original)).toBe(false);
    h.rerender({
      ...props,
      scopeKey: 'source',
      recording: { ...recording, notice: 'Edited fresh hook.' },
    });
    expect(h.result.current.dialog?.notice).toBe('Edited fresh hook.');
  });

  it('dismisses an old open notice when recovery lands on an already acknowledged recording', () => {
    const old = {
      ...base,
      textBibleKey: 'dbl-recovery-hook',
      recording: { ...recording, notice: 'Old recovery hook.' },
      isPlaying: true,
    };
    const replacement = {
      ...old,
      recording: {
        ...recording,
        recordingKey: 'aq-replacement-hook',
        notice: 'Acknowledged replacement hook.',
      },
    };
    recordedNoticeAckStore.acknowledge({
      textBibleKey: replacement.textBibleKey,
      textBibleName: replacement.textBibleName,
      recordingKey: replacement.recording.recordingKey,
      recordingName: replacement.recording.recordingName,
      recordingProvider: replacement.recording.recordingProvider,
      notice: replacement.recording.notice,
    });
    const h = renderHook(input => useRecordedNotice(input), { initialProps: old });
    expect(h.result.current.dialog?.notice).toBe('Old recovery hook.');
    h.rerender(replacement);
    expect(h.result.current.dialog).toBeNull();
    expect(h.result.current.infoFor('group-1')?.recordingKey).toBe('aq-replacement-hook');
  });

  it('keeps one pending dialog when the same recording crosses a playable boundary', () => {
    const props: UseRecordedNoticeOptions = {
      ...base,
      textBibleKey: 'dbl-boundary-hook',
      recording: { ...recording, notice: 'Boundary hook notice.' },
      isPlaying: true,
    };
    const h = renderHook(input => useRecordedNotice(input), { initialProps: props });
    const pending = h.result.current.dialog;

    h.rerender({
      ...props,
      recording: { ...props.recording!, playableKey: 'group-2' },
    });

    expect(h.result.current.dialog).toBe(pending);
    expect(recordedNoticeAckStore.isAcknowledged(pending!)).toBe(false);
    expect(h.result.current.infoFor('group-1')).toBeNull();
    expect(h.result.current.infoFor('group-2')).toBe(pending);
  });

  it('keeps a pending dialog mounted during a notice refresh, then honors the result', () => {
    const props: UseRecordedNoticeOptions = {
      ...base,
      textBibleKey: 'dbl-refresh-hook',
      recording: { ...recording, notice: 'Refresh hook notice.' },
      isPlaying: true,
    };
    const h = renderHook(input => useRecordedNotice(input), { initialProps: props });
    const pending = h.result.current.dialog;

    h.rerender({
      ...props,
      recording: { ...props.recording!, notice: null, noticePending: true },
    });
    expect(h.result.current.dialog).toBe(pending);

    h.rerender({
      ...props,
      recording: { ...props.recording!, notice: '', noticePending: false },
    });
    expect(h.result.current.dialog).toBeNull();
    expect(recordedNoticeAckStore.isAcknowledged(pending!)).toBe(false);
  });

  it.each([
    ['blank notice', { ...recording, notice: '' }],
    ['TTS or fallback', null],
  ])('does not open for %s', (_label, nextRecording) => {
    const h = renderHook(props => useRecordedNotice(props), {
      initialProps: { ...base, recording: nextRecording, isPlaying: true },
    });
    expect(h.result.current.dialog).toBeNull();
    expect(h.result.current.infoFor('group-1')).toBeNull();
  });
});
