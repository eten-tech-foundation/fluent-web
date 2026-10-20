import {
  type QueryClient,
  queryOptions,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';

import { fetchAssistantLanguages, streamPassageBriefing } from './assistant.client';
import {
  ASSISTANT_WEB_REQUEST_VERSION,
  type AssistantLanguagesResponse,
  type PassageBriefingBaseRequest,
  type PassageBriefingData,
  type PassageBriefingRequest,
} from './assistant.types';

export const ASSISTANT_QUERY_DEFAULTS = {
  staleTime: 15 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
  retry: false,
  retryOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

const LANGUAGE_STALE_TIME = 60 * 60 * 1000;

export function assistantLanguagesQueryKey(projectId: number, persisted: string | null) {
  return ['assistant', 'languages', projectId, persisted] as const;
}

export function useAssistantLanguages(
  projectId: number,
  persisted: string | null,
  enabled: boolean
): UseQueryResult<AssistantLanguagesResponse> {
  return useQuery({
    queryKey: assistantLanguagesQueryKey(projectId, persisted),
    queryFn: () => fetchAssistantLanguages(projectId, persisted),
    enabled,
    staleTime: LANGUAGE_STALE_TIME,
    gcTime: ASSISTANT_QUERY_DEFAULTS.gcTime,
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function passageBriefingQueryKey(request: PassageBriefingRequest) {
  return [
    'assistant',
    'passage-briefing',
    ASSISTANT_WEB_REQUEST_VERSION,
    request.projectId,
    request.bookCode,
    request.chapter,
    request.activeVerse,
    request.outputLanguage,
    request.grounding,
    request.ignoreCache,
    request.persistentIgnoreCache,
    request.attempt,
  ] as const;
}

interface PassageBriefingAttempt {
  nonce: number;
  forceFresh: boolean;
  cancelled: boolean;
}

const INITIAL_ATTEMPT: PassageBriefingAttempt = {
  nonce: 0,
  forceFresh: false,
  cancelled: false,
};

export function passageBriefingAttemptQueryKey(request: PassageBriefingBaseRequest) {
  return [
    'assistant',
    'passage-briefing-attempt',
    ASSISTANT_WEB_REQUEST_VERSION,
    request.projectId,
    request.bookCode,
    request.chapter,
    request.activeVerse,
    request.outputLanguage,
    request.grounding,
    request.ignoreCache,
  ] as const;
}

export function usePassageBriefingAttempt(
  request: PassageBriefingBaseRequest
): PassageBriefingAttempt {
  const attempt = useQuery({
    queryKey: passageBriefingAttemptQueryKey(request),
    queryFn: () => Promise.resolve(INITIAL_ATTEMPT),
    initialData: INITIAL_ATTEMPT,
    enabled: false,
    staleTime: Infinity,
    gcTime: ASSISTANT_QUERY_DEFAULTS.gcTime,
  });
  return attempt.data;
}

export function startPassageBriefingAttempt(
  queryClient: QueryClient,
  request: PassageBriefingBaseRequest,
  forceFresh: boolean
): void {
  queryClient.setQueryData<PassageBriefingAttempt>(
    passageBriefingAttemptQueryKey(request),
    previous => ({ nonce: (previous?.nonce ?? 0) + 1, forceFresh, cancelled: false })
  );
}

function markPassageBriefingAttemptCancelled(
  queryClient: QueryClient,
  request: PassageBriefingRequest
): void {
  const baseRequest: PassageBriefingBaseRequest = {
    projectId: request.projectId,
    bookCode: request.bookCode,
    chapter: request.chapter,
    activeVerse: request.activeVerse,
    outputLanguage: request.outputLanguage,
    grounding: request.grounding,
    ignoreCache: request.persistentIgnoreCache,
  };
  queryClient.setQueryData<PassageBriefingAttempt>(
    passageBriefingAttemptQueryKey(baseRequest),
    previous => {
      const current = previous ?? INITIAL_ATTEMPT;
      return current.nonce === request.attempt ? { ...current, cancelled: true } : current;
    }
  );
}

export function selectedPassageBriefingRequest(
  queryClient: QueryClient,
  request: PassageBriefingBaseRequest
): PassageBriefingRequest {
  const attempt =
    queryClient.getQueryData<PassageBriefingAttempt>(passageBriefingAttemptQueryKey(request)) ??
    INITIAL_ATTEMPT;
  return {
    ...request,
    ignoreCache: request.ignoreCache || attempt.forceFresh,
    attempt: attempt.nonce,
    persistentIgnoreCache: request.ignoreCache,
  };
}

export function passageBriefingQueryOptions(
  queryClient: QueryClient,
  request: PassageBriefingRequest
) {
  const queryKey = passageBriefingQueryKey(request);
  const oneShotBypass = request.ignoreCache && !request.persistentIgnoreCache;
  return queryOptions({
    queryKey,
    queryFn: async context => {
      const publish = (data: PassageBriefingData) => {
        queryClient.setQueryData<PassageBriefingData>(queryKey, data);
      };
      // Ordinary paid work deliberately outlives an observer. A private cache-bypass attempt
      // has no shared artifact to preserve, so TanStack may stop it when its last observer leaves.
      if (!request.ignoreCache) return streamPassageBriefing(request, publish);
      const signal = context.signal;
      // TanStack rolls a cancelled query back to its preceding status and data. Keep this
      // terminal fact beside the durable selected-attempt identity so a partial stream cannot
      // masquerade as a reusable success after the panel remounts.
      const markCancelled = () => markPassageBriefingAttemptCancelled(queryClient, request);
      signal.addEventListener('abort', markCancelled, { once: true });
      try {
        return await streamPassageBriefing(request, publish, signal);
      } finally {
        signal.removeEventListener('abort', markCancelled);
      }
    },
    // A successful Force-fresh attempt is a reusable private artifact for this attempt identity.
    // Only another button click advances the nonce and authorizes another bypass request.
    staleTime: request.persistentIgnoreCache
      ? 0
      : oneShotBypass
        ? Infinity
        : ASSISTANT_QUERY_DEFAULTS.staleTime,
    gcTime: ASSISTANT_QUERY_DEFAULTS.gcTime,
    retry: ASSISTANT_QUERY_DEFAULTS.retry,
    retryOnMount: ASSISTANT_QUERY_DEFAULTS.retryOnMount,
    refetchOnMount: request.persistentIgnoreCache ? 'always' : oneShotBypass ? false : true,
    refetchOnWindowFocus: ASSISTANT_QUERY_DEFAULTS.refetchOnWindowFocus,
    refetchOnReconnect: ASSISTANT_QUERY_DEFAULTS.refetchOnReconnect,
  });
}

export function usePassageBriefing(
  queryClient: QueryClient,
  request: PassageBriefingRequest,
  enabled: boolean
): UseQueryResult<PassageBriefingData> {
  const queryKey = passageBriefingQueryKey(request);
  const selectedAttemptFailed = queryClient.getQueryState(queryKey)?.status === 'error';
  return useQuery({
    ...passageBriefingQueryOptions(queryClient, request),
    // A failed selected attempt is terminal until the user selects a new attempt with Retry.
    // This also blocks stale-data and persistent-bypass refetchOnMount behavior.
    enabled: enabled && !selectedAttemptFailed,
  });
}

export async function prefetchPassageBriefing(
  queryClient: QueryClient,
  request: PassageBriefingRequest
): Promise<void> {
  await queryClient.prefetchQuery(passageBriefingQueryOptions(queryClient, request));
}
