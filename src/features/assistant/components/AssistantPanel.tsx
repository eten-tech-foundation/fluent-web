import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle, RefreshCw } from 'lucide-react';

import {
  passageBriefingQueryKey,
  prefetchPassageBriefing,
  selectedPassageBriefingRequest,
  startPassageBriefingAttempt,
  useAssistantLanguages,
  usePassageBriefingAttempt,
  usePassageBriefing,
} from '../assistant.queries';
import {
  readAssistantIgnoreCache,
  readAssistantOutputLanguage,
  writeAssistantIgnoreCache,
  writeAssistantOutputLanguage,
} from '../assistant.storage';
import {
  type AssistantGroundingChoice,
  type PassageBriefingBaseRequest,
  type PassageBriefingContext,
  type PassageBriefingRequest,
} from '../assistant.types';

import { useAssistantConversation } from './AssistantConversationProvider';
import { AssistantConversationView } from './AssistantConversationView';
import { AssistantMarkdown } from './AssistantMarkdown';

const CONTEXT_DEBOUNCE_MS = 250;

function sameContext(left: PassageBriefingContext, right: PassageBriefingContext): boolean {
  return (
    left.projectId === right.projectId &&
    left.bookCode === right.bookCode &&
    left.chapter === right.chapter &&
    left.activeVerse === right.activeVerse
  );
}

function useDebouncedContext(context: PassageBriefingContext): PassageBriefingContext {
  const [debounced, setDebounced] = useState(context);
  useEffect(() => {
    if (sameContext(context, debounced)) return;
    const timeout = setTimeout(() => setDebounced(context), CONTEXT_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [context, debounced]);
  return debounced;
}

interface AssistantPanelProps {
  context: PassageBriefingContext;
  contextReady: boolean;
  contextError: boolean;
  nextContext: PassageBriefingContext | null;
  localForceOn: boolean;
  reference: string | null;
}

export function AssistantPanel({
  context,
  contextReady,
  contextError,
  nextContext,
  localForceOn,
  reference,
}: AssistantPanelProps) {
  const queryClient = useQueryClient();
  const { owner, state: conversation } = useAssistantConversation();
  useLayoutEffect(() => {
    owner.navigate({ context, ready: contextReady, intent: owner.getSnapshot().intent });
  }, [owner, context, contextReady]);
  const persistedLanguage = useRef(readAssistantOutputLanguage()).current;
  const languages = useAssistantLanguages(context.projectId, persistedLanguage, true);
  const outputLanguage = conversation.outputLanguage;
  const setOutputLanguage = (language: string) => owner.configure(language);
  const [ignoreCache, setIgnoreCache] = useState(readAssistantIgnoreCache);
  const grounding = conversation.grounding;
  const setGrounding = (choice: AssistantGroundingChoice) =>
    owner.configure(outputLanguage, choice);
  const touchedSuccessors = useRef(new Set<string>());
  const debouncedContext = useDebouncedContext(context);

  useEffect(() => {
    const response = languages.data;
    if (!response) return;
    const supported = response.languages.some(language => language.code === outputLanguage);
    if (!supported) {
      owner.configure(response.defaultLanguage);
      writeAssistantOutputLanguage(response.defaultLanguage);
    }
  }, [languages.data, outputLanguage, owner]);

  useEffect(() => {
    if (!localForceOn && grounding !== 'configured') owner.configure(outputLanguage, 'configured');
  }, [localForceOn, grounding, owner, outputLanguage]);

  const diagnosticGrounding = localForceOn ? grounding : null;
  const storedIgnoreCache = localForceOn && ignoreCache;
  const baseRequest = useMemo<PassageBriefingBaseRequest>(
    () => ({
      ...debouncedContext,
      outputLanguage,
      grounding: diagnosticGrounding,
      ignoreCache: storedIgnoreCache,
    }),
    [debouncedContext, outputLanguage, diagnosticGrounding, storedIgnoreCache]
  );
  const selectedAttempt = usePassageBriefingAttempt(baseRequest);
  const request = useMemo<PassageBriefingRequest>(
    () => ({
      ...baseRequest,
      ignoreCache: baseRequest.ignoreCache || selectedAttempt.forceFresh,
      attempt: selectedAttempt.nonce,
      persistentIgnoreCache: baseRequest.ignoreCache,
    }),
    [baseRequest, selectedAttempt]
  );
  const contextIsCurrent = sameContext(context, debouncedContext);
  const briefing = usePassageBriefing(
    queryClient,
    request,
    contextReady &&
      contextIsCurrent &&
      outputLanguage !== '' &&
      !selectedAttempt.cancelled &&
      !conversation.pinned,
    !conversation.pinned
  );
  const queryIdentity = JSON.stringify(request);
  useEffect(() => {
    if (!owner.consumeRefresh()) return;
    startPassageBriefingAttempt(queryClient, baseRequest, false);
  }, [owner, conversation.refresh, queryClient, baseRequest]);
  useEffect(() => {
    if (
      contextReady &&
      contextIsCurrent &&
      request.outputLanguage === conversation.outputLanguage &&
      JSON.stringify(selectedPassageBriefingRequest(queryClient, baseRequest)) ===
        JSON.stringify(request)
    )
      owner.observeBriefing(briefing.data ?? null, conversation.generation);
  }, [
    owner,
    briefing.data,
    contextReady,
    contextIsCurrent,
    request.outputLanguage,
    conversation.outputLanguage,
    conversation.generation,
    queryClient,
    baseRequest,
    request,
  ]);
  // Render the same signed snapshot that admission will freeze, including newly exposed widgets.
  const displayedBriefing = conversation.pinned ?? conversation.briefing;

  useEffect(() => {
    if (
      conversation.pinned ||
      briefing.data?.phase !== 'complete' ||
      !contextIsCurrent ||
      request.ignoreCache ||
      nextContext === null ||
      touchedSuccessors.current.has(queryIdentity)
    )
      return;
    touchedSuccessors.current.add(queryIdentity);
    const successorBase: PassageBriefingBaseRequest = {
      ...nextContext,
      outputLanguage,
      grounding: diagnosticGrounding,
      ignoreCache: storedIgnoreCache,
    };
    const successor: PassageBriefingRequest = selectedPassageBriefingRequest(
      queryClient,
      successorBase
    );
    if (successor.ignoreCache) return;
    if (queryClient.getQueryState(passageBriefingQueryKey(successor))?.status === 'error') return;
    void prefetchPassageBriefing(queryClient, successor);
  }, [
    conversation.pinned,
    briefing.data?.phase,
    contextIsCurrent,
    diagnosticGrounding,
    nextContext,
    outputLanguage,
    queryClient,
    queryIdentity,
    request.ignoreCache,
    storedIgnoreCache,
  ]);

  const startAttempt = (forceFresh: boolean) => {
    if (forceFresh) {
      owner.reset();
      owner.consumeRefresh();
    }
    startPassageBriefingAttempt(queryClient, baseRequest, forceFresh);
  };

  const cacheHitWash =
    localForceOn &&
    contextReady &&
    contextIsCurrent &&
    displayedBriefing?.phase === 'complete' &&
    displayedBriefing.cacheHit;

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col ${cacheHitWash ? 'bg-purple-100/70' : ''}`}
      data-cache-hit={cacheHitWash ? 'true' : 'false'}
    >
      <div className='border-border border-b px-3 py-3'>
        {reference ? (
          <h2 className='text-foreground mb-2 text-sm font-bold'>{reference}</h2>
        ) : (
          <p className='text-muted-foreground mb-2 text-sm'>
            {contextError ? 'Passage context unavailable.' : 'Resolving passage…'}
          </p>
        )}
        <div className='flex items-center gap-2'>
          <label
            className='text-muted-foreground text-xs font-semibold'
            htmlFor='assistant-language'
          >
            Output language
          </label>
          <select
            aria-label='Assistant output language'
            className='border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-sm'
            disabled={!languages.data || languages.isError}
            id='assistant-language'
            value={outputLanguage}
            onChange={event => {
              setOutputLanguage(event.target.value);
              writeAssistantOutputLanguage(event.target.value);
            }}
          >
            {!languages.data && <option value=''>Loading…</option>}
            {languages.data?.languages.map(language => (
              <option key={language.code} value={language.code}>
                {language.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <AssistantConversationView enabled={contextReady && contextIsCurrent && !languages.isError}>
        {(submit, questionsEnabled) => (
          <>
            {languages.isError && (
              <FailureMessage message='Assistant languages are unavailable right now.' />
            )}
            {!languages.isError &&
              contextReady &&
              contextIsCurrent &&
              outputLanguage &&
              displayedBriefing?.source && (
                <AssistantMarkdown
                  outputContractVersion={displayedBriefing.metadata?.outputContractVersion ?? null}
                  source={displayedBriefing.source}
                  onSuggestedQuestion={questionsEnabled ? submit : undefined}
                />
              )}
            {!conversation.pinned &&
              !languages.isError &&
              contextReady &&
              outputLanguage &&
              (!contextIsCurrent ||
                (briefing.isFetching && briefing.data?.phase !== 'complete')) && (
                <p className='text-muted-foreground flex items-center gap-2 text-sm' role='status'>
                  <LoaderCircle aria-hidden='true' className='size-4 animate-spin' />
                  Preparing this passage briefing…
                </p>
              )}
            {!conversation.pinned &&
              contextReady &&
              contextIsCurrent &&
              (briefing.isError || selectedAttempt.cancelled) && (
                <div role='alert'>
                  <FailureMessage message='The briefing did not finish.' />
                  <button
                    className='text-primary mt-2 text-sm font-semibold underline underline-offset-2'
                    type='button'
                    onClick={() => startAttempt(false)}
                  >
                    <RefreshCw aria-hidden='true' className='mr-1 inline size-4' />
                    Retry
                  </button>
                </div>
              )}
          </>
        )}
      </AssistantConversationView>

      {localForceOn && (
        <div
          className='border-primary/30 bg-background fixed right-4 bottom-4 z-50 w-64 rounded-lg border p-3 text-xs shadow-lg'
          data-testid='assistant-debug-controls'
        >
          <p className='mb-2 font-bold'>Assistant debug</p>
          <button
            className='border-input hover:bg-muted mb-3 w-full rounded-md border px-2 py-1.5 font-semibold'
            disabled={!contextReady || !outputLanguage}
            type='button'
            onClick={() => startAttempt(true)}
          >
            Force fresh generation
          </button>
          <label className='mb-3 flex items-center gap-2'>
            <input
              checked={ignoreCache}
              type='checkbox'
              onChange={event => {
                setIgnoreCache(event.target.checked);
                writeAssistantIgnoreCache(event.target.checked);
              }}
            />
            Ignore cache
          </label>
          <label className='block font-semibold' htmlFor='assistant-grounding'>
            Grounding resources
          </label>
          <select
            className='border-input bg-background mt-1 w-full rounded-md border px-2 py-1'
            id='assistant-grounding'
            value={grounding}
            onChange={event => setGrounding(event.target.value as AssistantGroundingChoice)}
          >
            <option value='configured'>Configured behavior</option>
            <option value='output_language'>Same language as output</option>
            <option value='english'>English resources</option>
          </select>
        </div>
      )}
    </div>
  );
}

function FailureMessage({ message }: { message: string }) {
  return <p className='text-destructive text-sm'>{message}</p>;
}
