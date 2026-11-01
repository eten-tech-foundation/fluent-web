import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { LoaderCircle, RefreshCw, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TURN_LIMITS } from '../assistant.turn.types';
import { AssistantBriefingError, type AssistantFailureCode } from '../assistant.types';

import { useAssistantConversation } from './AssistantConversationProvider';
import { AssistantMarkdown } from './AssistantMarkdown';

const failureCopy: Record<AssistantFailureCode, string> = {
  invalid_request: 'Enter a question before sending.',
  unsupported_language: 'This output language is unavailable.',
  context_too_large:
    'This question or conversation is too long to send. Shorten your question or start a fresh conversation.',
  rate_limited: 'The Assistant is busy. Please try again later.',
  timed_out: 'The answer timed out.',
  temporarily_unavailable: 'The Assistant is temporarily unavailable.',
  malformed_upstream_response: 'The answer could not be read.',
  stream_incomplete: 'The answer did not finish.',
  network_error: 'The connection was interrupted.',
};

export function AssistantFailure({ error }: { error: AssistantBriefingError }) {
  const { t } = useTranslation();
  return (
    <p className='text-destructive text-sm'>
      {t(`assistant.failure.${error.code}`, failureCopy[error.code])}
    </p>
  );
}

export function AssistantConversationView({
  children,
  enabled,
}: {
  children: (submit: (text: string, event: object) => void, enabled: boolean) => ReactNode;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const { owner, state } = useAssistantConversation();
  const [admission, setAdmission] = useState<{
    generation: number;
    error: AssistantBriefingError;
  } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const bringSubmissionIntoView = useRef(false);
  const composing = useRef(false);
  const handled = useRef(new WeakSet<object>());
  const briefing = state.pinned ?? state.briefing;
  const available = enabled && state.ready && !!briefing?.integrity;
  const typedAvailable = available && (!!state.pinned || briefing.phase === 'complete');
  const lastTurn = state.turns.at(-1);
  const latest = lastTurn?.attempts.find(
    attempt => attempt.attemptId === lastTurn.selectedAttemptId
  );
  const busy = latest?.state === 'waiting' || latest?.state === 'streaming';
  const submit = (text: string, origin: 'typed' | 'suggested_question', event: object) => {
    if (handled.current.has(event)) return;
    handled.current.add(event);
    const error = owner.submit(text, origin, event);
    setAdmission(error ? { generation: state.generation, error } : null);
    if (!error) bringSubmissionIntoView.current = true;
  };
  useLayoutEffect(() => {
    if (!scroll.current) return;
    if (following.current || bringSubmissionIntoView.current) {
      scroll.current.scrollTop = scroll.current.scrollHeight;
      following.current = true;
      bringSubmissionIntoView.current = false;
    }
  });
  return (
    <>
      <div
        ref={scroll}
        aria-label={t('assistant.conversation', 'Passage conversation')}
        className='min-h-0 flex-1 overflow-y-auto px-3 py-4'
        role='region'
        onScroll={() => {
          const element = scroll.current;
          if (element)
            following.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 32;
        }}
      >
        {children((text, event) => submit(text, 'suggested_question', event), available)}
        {enabled &&
          state.turns.map((turn, index) => {
            const attempt = turn.attempts.find(item => item.attemptId === turn.selectedAttemptId);
            if (!attempt) return null;
            const pending = attempt.state === 'waiting' || attempt.state === 'streaming';
            const retryable =
              index === state.turns.length - 1 &&
              (attempt.state === 'failed' || attempt.state === 'interrupted') &&
              attempt.failure?.retryable !== false;
            return (
              <section key={turn.turnId} className='border-border mt-4 border-t pt-4'>
                <h3 className='text-muted-foreground mb-2 text-xs font-bold'>
                  {t('assistant.you', 'YOU')}
                </h3>
                <p className='mb-4 text-sm break-words whitespace-pre-wrap italic'>
                  {turn.input.text}
                </p>
                <h3 className='text-primary mb-2 text-xs font-bold'>
                  {t('assistant.name', 'AI ASSISTANT')}
                </h3>
                {attempt.prefix?.markdown && (
                  <AssistantMarkdown
                    outputContractVersion={null}
                    source={attempt.prefix.markdown}
                  />
                )}
                {pending && (
                  <p className='text-muted-foreground mt-2 flex items-center gap-2 text-sm'>
                    <LoaderCircle aria-hidden='true' className='size-4 animate-spin' />
                    {t('assistant.answering', 'Preparing an answer…')}
                  </p>
                )}
                {attempt.failure && <AssistantFailure error={attempt.failure} />}
                {attempt.state === 'interrupted' && (
                  <p className='text-muted-foreground text-sm'>
                    {t('assistant.interrupted', 'This answer was interrupted by a new question.')}
                  </p>
                )}
                {retryable && (
                  <button
                    className='text-primary mt-2 inline-flex items-center gap-1 text-sm font-semibold'
                    disabled={!available}
                    type='button'
                    onClick={event => {
                      const error = owner.retry(event.nativeEvent);
                      setAdmission(error ? { generation: state.generation, error } : null);
                      if (!error) bringSubmissionIntoView.current = true;
                    }}
                  >
                    <RefreshCw aria-hidden='true' className='size-4' />
                    {t('assistant.retry', 'Retry')}
                  </button>
                )}
              </section>
            );
          })}
      </div>
      <div aria-live='polite' className='sr-only' role='status'>
        {busy
          ? t('assistant.answering', 'Preparing an answer…')
          : latest?.state === 'complete'
            ? t('assistant.answerReady', 'Answer ready.')
            : latest?.state === 'failed'
              ? t('assistant.answerFailed', 'The answer did not finish.')
              : ''}
      </div>
      <div className='border-border shrink-0 border-t p-3'>
        {state.notice === 'context_changed' && (
          <p className='mb-2 text-sm' role='status'>
            {t(
              'assistant.contextChanged',
              'The passage context changed. Your question is saved below. Review the refreshed briefing and send it again.'
            )}
          </p>
        )}
        {state.omittedTurnIds.length > 0 && (
          <p className='text-muted-foreground mb-2 text-xs' role='status'>
            {t(
              'assistant.omittedHistory',
              'Some older exchanges are no longer included in the Assistant’s answer context. They remain visible above.'
            )}
          </p>
        )}
        {enabled && briefing?.phase === 'complete' && !briefing.integrity && (
          <div className='mb-2' role='status'>
            <AssistantFailure
              error={
                new AssistantBriefingError(
                  briefing.continuationUnavailable ?? 'temporarily_unavailable',
                  false
                )
              }
            />
          </div>
        )}
        {!typedAvailable && (
          <p className='text-muted-foreground mb-2 text-xs' id='assistant-composer-help'>
            {available
              ? t(
                  'assistant.waitBriefing',
                  'You can write now. Send your question when the briefing finishes, or choose a suggested question.'
                )
              : t(
                  'assistant.waitAvailable',
                  'You can write now. Sending will be available when passage context is ready.'
                )}
          </p>
        )}
        {admission?.generation === state.generation && (
          <div className='mb-2' role='alert'>
            <AssistantFailure error={admission.error} />
          </div>
        )}
        <form
          className='flex items-end gap-2'
          onSubmit={event => {
            event.preventDefault();
            if (!composing.current && typedAvailable)
              submit(owner.getSnapshot().draft, 'typed', event.nativeEvent);
          }}
        >
          <textarea
            aria-describedby={!typedAvailable ? 'assistant-composer-help' : undefined}
            aria-label={t('assistant.question', 'Question about this passage')}
            className='border-input bg-background max-h-32 min-h-10 min-w-0 flex-1 resize-y rounded-md border px-3 py-2 text-sm'
            placeholder={t('assistant.placeholder', 'Ask a question about this passage...')}
            rows={1}
            value={state.draft}
            onChange={event => {
              owner.setDraft(event.target.value);
              setAdmission(null);
            }}
            onCompositionEnd={() => {
              composing.current = false;
            }}
            onCompositionStart={() => {
              composing.current = true;
            }}
            onKeyDown={event => {
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                event.nativeEvent.isComposing ||
                composing.current ||
                event.keyCode === 229
              )
                return;
              event.preventDefault();
              if (!event.repeat && typedAvailable)
                submit(owner.getSnapshot().draft, 'typed', event.nativeEvent);
            }}
          />
          <button
            aria-label={t('assistant.send', 'Send question')}
            className='bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-md disabled:opacity-50'
            disabled={!typedAvailable || !state.draft.trim()}
            type='submit'
          >
            <Send aria-hidden='true' className='size-4' />
          </button>
        </form>
        {state.draft.length > TURN_LIMITS.inputChars && (
          <p className='text-destructive mt-1 text-xs'>
            {t('assistant.inputLimit', 'Questions can contain at most {{count}} characters.', {
              count: TURN_LIMITS.inputChars,
            })}
          </p>
        )}
      </div>
    </>
  );
}
