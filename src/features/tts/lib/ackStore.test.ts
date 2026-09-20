import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRecordedNoticeAckStore, recordedNoticeKey, type RecordedNotice } from './ackStore';

const notice = (extra: Partial<RecordedNotice> = {}): RecordedNotice => ({
  textBibleKey: 'dbl-text',
  textBibleName: 'Text Bible',
  recordingKey: 'aq-1',
  recordingName: 'Recorded Bible',
  recordingProvider: 'aquifer',
  notice: 'Public-domain recording.',
  ...extra,
});

beforeEach(() => localStorage.clear());

describe('recorded notice acknowledgment identity', () => {
  it('uses exact text, recording and displayed notice identities', () => {
    const keys = [
      notice(),
      notice({ textBibleKey: 'aq-1' }),
      notice({ recordingKey: 'aq-2' }),
      notice({ notice: 'Edited notice.' }),
    ].map(recordedNoticeKey);
    expect(new Set(keys).size).toBe(4);
  });

  it('shares chapters, codecs, roles and renamed labels because they are not policy identity', () => {
    expect(
      recordedNoticeKey(
        notice({ textBibleName: 'Renamed text', recordingName: 'Renamed recording' })
      )
    ).toBe(recordedNoticeKey(notice()));
  });
});

describe('recorded notice acknowledgment storage', () => {
  it('persists display data for the phase 09 list and suppresses a fresh store', () => {
    createRecordedNoticeAckStore().acknowledge(notice());
    const fresh = createRecordedNoticeAckStore();
    expect(fresh.isAcknowledged(notice())).toBe(true);
    expect(fresh.list()).toEqual([{ notice: notice(), acknowledgedAt: expect.any(String) }]);
  });

  it('falls back to memory when storage acquisition or operations throw', () => {
    const denied = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('denied');
      }),
      key: vi.fn(() => {
        throw new Error('denied');
      }),
      get length() {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const store = createRecordedNoticeAckStore(denied);
    store.acknowledge(notice());
    expect(store.isAcknowledged(notice())).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it('ignores malformed entries and entries stored under a different exact key', () => {
    localStorage.setItem('fluent.audio.recorded-notice.bad', '{');
    const key = recordedNoticeKey(notice());
    localStorage.setItem(
      `fluent.audio.recorded-notice.${key}`,
      JSON.stringify({
        notice: notice({ notice: 'Wrong' }),
        acknowledgedAt: new Date().toISOString(),
      })
    );
    const store = createRecordedNoticeAckStore();
    expect(store.isAcknowledged(notice())).toBe(false);
    expect(store.list()).toEqual([]);
  });
});
