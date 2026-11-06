import { describe, expect, it, vi } from 'vitest';

import {
  ASSISTANT_ACTIONS,
  assistantActionsSchema,
  executeAssistantAction,
  parseAssistantAction,
} from './assistant.actions';

describe('Web action registry', () => {
  it('sends declarative templates without parsers or handlers', () => {
    expect(assistantActionsSchema.parse(ASSISTANT_ACTIONS)).toEqual(ASSISTANT_ACTIONS);
    expect(Object.keys(ASSISTANT_ACTIONS[0]).sort()).toEqual(['purpose', 'template', 'type']);
    expect(ASSISTANT_ACTIONS[0].template).toBe('{{fluent:v1:suggested_question|QUESTION}}');
  });
  it('rejects executable/extra properties and oversized catalogs', () => {
    expect(
      assistantActionsSchema.safeParse([{ ...ASSISTANT_ACTIONS[0], handler: 'code' }]).success
    ).toBe(false);
    expect(assistantActionsSchema.safeParse(Array(33).fill(ASSISTANT_ACTIONS[0])).success).toBe(
      false
    );
    expect(
      assistantActionsSchema.safeParse([{ ...ASSISTANT_ACTIONS[0], template: 'x'.repeat(4097) }])
        .success
    ).toBe(false);
  });
  it('preserves the plain payload without imposing the submission length limit on rendering', () => {
    const question = 'x'.repeat(4001);
    expect(parseAssistantAction(`{{fluent:v1:suggested_question|${question}}}`)?.payload).toBe(
      question
    );
  });
  it('keeps unknown, incomplete, malformed and future actions inert', () => {
    for (const macro of [
      '{{fluent:v2:suggested_question|Q}}',
      '{{fluent:v1:delete|Q}}',
      '{{fluent:v1:suggested_question|Q',
      '{{fluent:v1:suggested_question|{Q}}}',
    ]) {
      expect(parseAssistantAction(macro)).toBeNull();
    }
    const submit = vi.fn();
    executeAssistantAction('delete', 'Q', {}, { suggestedQuestion: submit });
    executeAssistantAction('suggested_question', '{Q}', {}, { suggestedQuestion: submit });
    expect(submit).not.toHaveBeenCalled();
    const event = {};
    executeAssistantAction('suggested_question', 'Q', event, { suggestedQuestion: submit });
    expect(submit).toHaveBeenCalledWith('Q', event);
  });
});
