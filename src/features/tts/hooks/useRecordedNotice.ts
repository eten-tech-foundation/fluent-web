import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { recordedNoticeAckStore, recordedNoticeKey, type RecordedNotice } from '../lib/ackStore';

interface ActualRecording {
  recordingKey: string;
  recordingName: string;
  recordingProvider: RecordedNotice['recordingProvider'];
  notice: string | null;
  noticePending?: boolean;
  playableKey: string;
}

export interface UseRecordedNoticeOptions {
  scopeKey: string;
  textBibleKey: string | null;
  textBibleName: string;
  recording: ActualRecording | null;
  isPlaying: boolean;
  enabled: boolean;
}

/** Owns the courtesy popup and retained player Info without becoming playback authority. */
export function useRecordedNotice({
  scopeKey,
  textBibleKey,
  textBibleName,
  recording,
  isPlaying,
  enabled,
}: UseRecordedNoticeOptions) {
  const recordingKey = recording?.recordingKey;
  const recordingName = recording?.recordingName;
  const recordingProvider = recording?.recordingProvider;
  const recordingNotice = recording?.notice;
  const noticePending = recording?.noticePending ?? false;
  const playableKey = recording?.playableKey;
  const candidate = useMemo<RecordedNotice | null>(() => {
    if (
      !enabled ||
      !textBibleKey ||
      !recordingKey ||
      !recordingName ||
      !recordingProvider ||
      !recordingNotice?.trim()
    )
      return null;
    return {
      textBibleKey,
      textBibleName: textBibleName || textBibleKey,
      recordingKey,
      recordingName,
      recordingProvider,
      notice: recordingNotice,
    };
  }, [
    enabled,
    recordingKey,
    recordingName,
    recordingNotice,
    recordingProvider,
    textBibleKey,
    textBibleName,
  ]);
  const candidateKey = candidate ? recordedNoticeKey(candidate) : null;
  const [dialog, setDialog] = useState<RecordedNotice | null>(null);
  const [retained, setRetained] = useState<{
    scopeKey: string;
    playableKey: string;
    notice: RecordedNotice;
  } | null>(null);
  const scopeRef = useRef(scopeKey);

  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    setDialog(null); // selection dismissal is not an acknowledgment
    setRetained(null);
  }, [scopeKey]);

  useEffect(() => {
    if (noticePending) return;
    if (!recordingKey || !playableKey || !candidate) {
      setDialog(null); // a successful blank or failed fact removes old authority
      setRetained(null);
      return;
    }
    setRetained(current =>
      current?.scopeKey === scopeKey &&
      current.playableKey === playableKey &&
      recordedNoticeKey(current.notice) === candidateKey
        ? current
        : { scopeKey, playableKey, notice: candidate }
    );
    setDialog(current => {
      const acknowledged = recordedNoticeAckStore.isAcknowledged(candidate);
      if (current && recordedNoticeKey(current) !== candidateKey) {
        return isPlaying && !acknowledged ? candidate : null;
      }
      if (!isPlaying || acknowledged) return current;
      return candidate;
    });
  }, [candidate, candidateKey, isPlaying, noticePending, playableKey, recordingKey, scopeKey]);

  const close = useCallback(() => {
    setDialog(current => {
      if (current) recordedNoticeAckStore.acknowledge(current);
      return null;
    });
  }, []);
  const show = useCallback((notice: RecordedNotice) => setDialog(notice), []);
  const infoFor = useCallback(
    (playableKey: string) =>
      retained?.scopeKey === scopeKey && retained.playableKey === playableKey
        ? retained.notice
        : null,
    [retained, scopeKey]
  );

  return { dialog, close, show, infoFor };
}
