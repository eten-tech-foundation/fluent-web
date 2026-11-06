import { z } from 'zod';

/** Declarative model instructions only; executable behavior stays in the Web registry. */
export const assistantActionsSchema = z
  .array(
    z
      .object({
        type: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
        purpose: z.string().min(1).max(1024),
        template: z.string().min(1).max(4096),
      })
      .strict()
  )
  .max(32)
  .refine(actions => new TextEncoder().encode(JSON.stringify(actions)).byteLength <= 32_768)
  .default([]);

export interface AssistantAction {
  type: string;
  payload: string;
  label: string;
}

export interface AssistantActionHandlers {
  suggestedQuestion?: (question: string, event: object) => void;
}

const registry = [
  {
    type: 'suggested_question',
    purpose:
      'Offer a useful question that the user can click to ask the Assistant. Available throughout the conversation.',
    template: '{{fluent:v1:suggested_question|QUESTION}}',
    available: (handlers: AssistantActionHandlers) => !!handlers.suggestedQuestion,
    execute: (payload: string, event: object, handlers: AssistantActionHandlers) =>
      handlers.suggestedQuestion?.(payload, event),
    parse(payload: string): AssistantAction | null {
      return payload.trim() && !/[{}\r\n]/.test(payload)
        ? { type: 'suggested_question', payload, label: payload }
        : null;
    },
  },
];

export const ASSISTANT_ACTIONS = registry.map(({ type, purpose, template }) => ({
  type,
  purpose,
  template,
}));

/** Unknown types/versions and incomplete envelopes are readable, inert text. */
export function parseAssistantAction(source: string): AssistantAction | null {
  const match = /^\{\{fluent:v1:([a-z][a-z0-9_]*)\|([^\r\n]*)\}\}$/.exec(source);
  if (!match) return null;
  return registry.find(action => action.type === match[1])?.parse(match[2]) ?? null;
}

export function assistantActionAvailable(type: string, handlers: AssistantActionHandlers): boolean {
  return registry.find(action => action.type === type)?.available(handlers) ?? false;
}

export function executeAssistantAction(
  type: string,
  payload: string,
  event: object,
  handlers: AssistantActionHandlers
): void {
  const action = registry.find(entry => entry.type === type);
  if (action?.parse(payload) && action.available(handlers))
    action.execute(payload, event, handlers);
}
