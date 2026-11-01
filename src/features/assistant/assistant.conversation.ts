import { streamAssistantTurn, type TurnUpdate } from './assistant.turn.client';
import {
  assistantTurnRequestSchema,
  type AssistantTurn,
  type AssistantTurnRequest,
} from './assistant.turn.types';
import {
  AssistantBriefingError,
  type AssistantGroundingChoice,
  type PassageBriefingContext,
  type PassageBriefingData,
} from './assistant.types';

export interface ConversationNavigation {
  context: PassageBriefingContext;
  ready: boolean;
  intent: string;
  passageChapters?: number[];
}
export interface ConversationAttempt {
  attemptId: string;
  operationId: string;
  state: 'waiting' | 'streaming' | 'complete' | 'failed' | 'interrupted';
  prefix: AssistantTurn['attempts'][number]['prefix'];
  failure?: AssistantBriefingError;
}
export interface ConversationTurn extends Omit<AssistantTurn, 'attempts'> {
  attempts: ConversationAttempt[];
}
export interface ConversationState {
  generation: number;
  ready: boolean;
  context: PassageBriefingContext | null;
  intent: string;
  outputLanguage: string;
  grounding: AssistantGroundingChoice;
  draft: string;
  turns: ConversationTurn[];
  briefing: PassageBriefingData | null;
  pinned: PassageBriefingData | null;
  refresh: number;
  notice: 'context_changed' | null;
  omittedTurnIds: string[];
}
const contextKey = (context: PassageBriefingContext | null) => JSON.stringify(context);
const initial = (): ConversationState => ({
  generation: 0,
  ready: false,
  context: null,
  intent: '',
  outputLanguage: '',
  grounding: 'configured',
  draft: '',
  turns: [],
  briefing: null,
  pinned: null,
  refresh: 0,
  notice: null,
  omittedTurnIds: [],
});
type Transport = typeof streamAssistantTurn;

/** A single ephemeral drafting-workspace conversation, independent of the briefing query cache. */
export class AssistantConversation {
  private state = initial();
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private actor: number | null = null;
  private project: number | null = null;
  private pageIntent = '';
  private passageChapters: number[] | null = null;
  private consumedRefresh = 0;
  private typedInteraction = false;
  private admissionEvents = new WeakSet<object>();
  constructor(private readonly transport: Transport = streamAssistantTurn) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(next: Partial<ConversationState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener());
  }
  private boundary(next: Partial<ConversationState> = {}) {
    this.typedInteraction = false;
    this.active?.abort();
    this.active = null;
    this.update({
      ...initial(),
      outputLanguage: this.state.outputLanguage,
      grounding: this.state.grounding,
      generation: this.state.generation + 1,
      refresh: this.state.refresh,
      ...next,
    });
  }
  intent(
    actor: number | null,
    project: number | null,
    intent: string,
    selector?: { bookCode: string; chapter: number }
  ) {
    if (
      actor !== this.actor ||
      (intent !== this.pageIntent &&
        selector &&
        this.passageChapters &&
        this.state.context &&
        (selector.bookCode !== this.state.context.bookCode ||
          !this.passageChapters.includes(selector.chapter))) ||
      (project !== null && this.project !== null && project !== this.project)
    ) {
      this.boundary({ intent });
    } else if (intent !== this.state.intent) this.update({ ready: false, intent });
    this.actor = actor;
    this.project = project;
    this.pageIntent = intent;
  }
  navigate({ context, ready, intent, passageChapters }: ConversationNavigation) {
    if (this.project !== null && context.projectId !== this.project) return;
    if (ready && passageChapters) this.passageChapters = passageChapters;
    if (
      this.state.ready === ready &&
      this.state.intent === intent &&
      (!ready || contextKey(context) === contextKey(this.state.context))
    )
      return;
    if (!ready) {
      this.update({ ready: false, intent });
      return;
    }
    if (this.state.context && contextKey(context) !== contextKey(this.state.context))
      this.boundary({ context, ready, intent });
    else this.update({ context, ready, intent });
  }
  setDraft = (draft: string) => {
    if (draft.length) this.typedInteraction = true;
    this.update({ draft });
  };
  configure(outputLanguage: string, grounding = this.state.grounding) {
    if (outputLanguage === this.state.outputLanguage && grounding === this.state.grounding) return;
    this.boundary({
      context: this.state.context,
      ready: this.state.ready,
      intent: this.state.intent,
      outputLanguage,
      grounding,
    });
  }
  reset = () =>
    this.boundary({
      context: this.state.context,
      ready: this.state.ready,
      intent: this.state.intent,
      refresh: this.state.refresh + 1,
    });
  consumeRefresh() {
    if (this.consumedRefresh === this.state.refresh) return false;
    this.consumedRefresh = this.state.refresh;
    return true;
  }
  observeBriefing(data: PassageBriefingData | null, generation: number) {
    if (generation !== this.state.generation || this.state.pinned || !this.state.ready) return;
    this.update({ briefing: data });
  }
  dispose() {
    this.active?.abort();
    this.active = null;
    this.boundary();
  }
  private replaceAttempt(turnId: string, attemptId: string, changes: Partial<ConversationAttempt>) {
    this.update({
      turns: this.state.turns.map(turn =>
        turn.turnId !== turnId
          ? turn
          : {
              ...turn,
              attempts: turn.attempts.map(attempt =>
                attempt.attemptId === attemptId ? { ...attempt, ...changes } : attempt
              ),
            }
      ),
    });
  }
  /** One UI event can enter only once; separate deliberate events can interrupt immediately. */
  submit(
    text: string,
    origin: 'typed' | 'suggested_question',
    event: object = {},
    retry = false
  ): AssistantBriefingError | null {
    if (this.admissionEvents.has(event))
      return new AssistantBriefingError('invalid_request', false);
    const snapshot = this.state;
    const briefing = snapshot.pinned ?? snapshot.briefing;
    if (
      !snapshot.ready ||
      !snapshot.context ||
      !snapshot.outputLanguage ||
      !briefing?.integrity ||
      (origin === 'typed' && !snapshot.pinned && briefing.phase !== 'complete')
    )
      return new AssistantBriefingError(
        briefing?.continuationUnavailable ?? 'temporarily_unavailable',
        false
      );
    if (!text.trim()) return new AssistantBriefingError('invalid_request', false);
    const previous = snapshot.turns.at(-1);
    const selected = previous?.attempts.find(
      attempt => attempt.attemptId === previous.selectedAttemptId
    );
    if (
      retry &&
      (!previous ||
        !selected ||
        !['failed', 'interrupted'].includes(selected.state) ||
        selected.failure?.retryable === false)
    )
      return new AssistantBriefingError('invalid_request', false);
    const input = retry && previous ? previous.input : { text, origin };
    const turnId = retry && previous ? previous.turnId : crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    const turns: AssistantTurn[] = snapshot.turns.map(turn => ({
      ...turn,
      attempts: turn.attempts.map(attempt => ({
        attemptId: attempt.attemptId,
        operationId: attempt.operationId,
        prefix: attempt.prefix,
        state:
          attempt.state === 'waiting' || attempt.state === 'streaming'
            ? 'interrupted'
            : attempt.state,
      })),
    }));
    const request: AssistantTurnRequest = {
      protocol: 'fluent-turn-v1',
      bookCode: snapshot.context.bookCode,
      chapter: snapshot.context.chapter,
      activeVerse: snapshot.context.activeVerse,
      outputLanguage: snapshot.outputLanguage,
      grounding: snapshot.grounding,
      contextReceipt: briefing.integrity.contextReceipt,
      briefing: briefing.integrity.prefix,
      turns,
      submission: { kind: retry ? 'retry' : 'new', turnId, attemptId, input },
      dont_cache:
        retry ||
        origin !== 'suggested_question' ||
        turns.length !== 0 ||
        this.typedInteraction ||
        !briefing.integrity.prefix.complete,
    };
    if (!assistantTurnRequestSchema.safeParse(request).success)
      return new AssistantBriefingError('context_too_large', false);
    this.admissionEvents.add(event);
    this.active?.abort();
    const controller = new AbortController();
    this.active = controller;
    const attempt: ConversationAttempt = {
      attemptId,
      operationId: attemptId,
      state: 'waiting',
      prefix: null,
    };
    const nextTurns: ConversationTurn[] = snapshot.turns.map(turn => ({
      ...turn,
      attempts: turn.attempts.map(previousAttempt => ({
        ...previousAttempt,
        state:
          previousAttempt.state === 'waiting' || previousAttempt.state === 'streaming'
            ? 'interrupted'
            : previousAttempt.state,
      })),
    }));
    if (retry && previous)
      nextTurns[nextTurns.length - 1] = {
        ...previous,
        selectedAttemptId: attemptId,
        attempts: [...previous.attempts, attempt],
      };
    else nextTurns.push({ turnId, input, selectedAttemptId: attemptId, attempts: [attempt] });
    this.update({
      turns: nextTurns,
      pinned: briefing,
      draft: origin === 'typed' && !retry ? '' : snapshot.draft,
      notice: null,
    });
    const generation = this.state.generation;
    const current = () =>
      this.state.generation === generation &&
      this.active === controller &&
      !controller.signal.aborted;
    const publish = (update: TurnUpdate) => {
      if (!current()) return;
      if (update.type === 'context_changed') {
        this.boundary({
          context: this.state.context,
          ready: this.state.ready,
          intent: this.state.intent,
          refresh: this.state.refresh + 1,
          draft: input.text,
          notice: 'context_changed',
        });
      } else if (update.type === 'turn_started') {
        this.replaceAttempt(turnId, attemptId, {
          operationId: update.operationId,
          state: 'streaming',
        });
        this.update({ omittedTurnIds: update.projection.omittedTurnIds });
      } else
        this.replaceAttempt(turnId, attemptId, {
          operationId: update.operationId,
          prefix: update.prefix,
          state: update.prefix.complete ? 'complete' : 'streaming',
        });
    };
    void this.transport(snapshot.context.projectId, request, publish, controller.signal)
      .catch((error: unknown) => {
        if (!current()) return;
        this.replaceAttempt(turnId, attemptId, {
          state: 'failed',
          failure:
            error instanceof AssistantBriefingError
              ? error
              : new AssistantBriefingError('network_error', true),
        });
      })
      .finally(() => {
        if (this.active === controller) this.active = null;
      });
    return null;
  }
  retry(event?: object) {
    const last = this.state.turns.at(-1);
    return last
      ? this.submit(last.input.text, last.input.origin, event, true)
      : new AssistantBriefingError('invalid_request', false);
  }
}
