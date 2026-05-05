import { useCallback, useEffect, useRef, useState } from 'react';

import { useMutation } from '@tanstack/react-query';

import { config } from '@/lib/config';
import { Logger } from '@/lib/services/logger';

interface PresenceResponse {
  isFirstEditor: boolean;
  firstEditorName: string | null;
}

const HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds

export const useChapterPresence = (
  chapterAssignmentId: number,
  isActive: boolean,
  userEmail: string
) => {
  const [editorName, setEditorName] = useState<string | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCleanedUpRef = useRef(false);

  // Assign directly during render — never stale, no useEffect needed.
  const chapterAssignmentIdRef = useRef(chapterAssignmentId);
  const userEmailRef = useRef(userEmail);
  chapterAssignmentIdRef.current = chapterAssignmentId;
  userEmailRef.current = userEmail;

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const email = userEmailRef.current;
      const assignmentId = chapterAssignmentIdRef.current;

      if (!email) return null;

      const res = await fetch(`${config.api.url}/chapter-assignments/${assignmentId}/presence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': email,
        },
      });

      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Failed to send heartbeat');

      return (await res.json()) as PresenceResponse;
    },
    onSuccess: data => {
      if (data && !data.isFirstEditor && data.firstEditorName) {
        setEditorName(data.firstEditorName);
      } else {
        setEditorName(null);
      }
    },
    onError: err => {
      Logger.logException(err, { context: 'Presence heartbeat error' });
    },
  });

  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;

  const isPendingRef = useRef(isPending);
  isPendingRef.current = isPending;

  const cleanup = useCallback(() => {
    const email = userEmailRef.current;
    const assignmentId = chapterAssignmentIdRef.current;

    if (isCleanedUpRef.current || !email || !assignmentId) return;
    isCleanedUpRef.current = true;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    void fetch(`${config.api.url}/chapter-assignments/${assignmentId}/presence`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': email,
      },
      keepalive: true,
    }).catch(err => {
      Logger.logException(err, { context: 'Presence cleanup error' });
    });
  }, []);

  useEffect(() => {
    if (!isActive) {
      setEditorName(null);
      return;
    }

    if (!chapterAssignmentId || !userEmail) return;

    isCleanedUpRef.current = false;

    mutateRef.current();

    intervalRef.current = setInterval(() => {
      if (isPendingRef.current) return;
      mutateRef.current();
    }, HEARTBEAT_INTERVAL_MS);

    const handleBeforeUnload = () => cleanup();
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanup();
    };
  }, [chapterAssignmentId, isActive, userEmail, cleanup]);

  return { editorName };
};
