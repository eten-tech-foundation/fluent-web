import { describe, expect, it } from 'vitest';

import { assistantTurnRequestSchema } from './assistant.turn.types';
import fixture from './fixtures/turn-v1.json';

const request = fixture.request;
const previous = fixture.scenarios[0].request.turns[0];
const completeTurn = (index: number, markdown = 'Answer') => ({
  ...previous,
  turnId: `turn-${index}`,
  selectedAttemptId: `attempt-${index}`,
  attempts: [
    {
      attemptId: `attempt-${index}`,
      operationId: `operation-${index}`,
      state: 'complete',
      prefix: { ...request.briefing, markdown },
    },
  ],
});

describe('browser admission mirrors portable turn contract', () => {
  it('accepts exact new, partial, empty and retry fixtures without rewriting text', () => {
    for (const input of [request, ...fixture.scenarios.map(scenario => scenario.request)]) {
      expect(assistantTurnRequestSchema.parse(input)).toEqual(input);
    }
  });
  it('limits logical turns including submission to fifty without pruning', () => {
    const submission = { ...request.submission, turnId: 'new-turn', attemptId: 'new-attempt' };
    expect(
      assistantTurnRequestSchema.safeParse({
        ...request,
        submission,
        turns: Array.from({ length: 49 }, (_, index) => completeTurn(index)),
      }).success
    ).toBe(true);
    expect(
      assistantTurnRequestSchema.safeParse({
        ...request,
        submission,
        turns: Array.from({ length: 50 }, (_, index) => completeTurn(index)),
      }).success
    ).toBe(false);
  });
  it('retains full attempt history but refuses a fifth retry', () => {
    const retry = fixture.scenarios[1].request;
    const attempts = Array.from({ length: 4 }, (_, index) => ({
      ...previous.attempts[0],
      attemptId: `old-${index}`,
    }));
    const turns = [{ ...previous, selectedAttemptId: 'old-0', attempts }];
    expect(assistantTurnRequestSchema.safeParse({ ...retry, turns }).success).toBe(false);
    expect(
      assistantTurnRequestSchema.safeParse({
        ...retry,
        turns: [{ ...turns[0], attempts: attempts.slice(0, 3) }],
      }).success
    ).toBe(true);
  });
  it('counts serialized UTF-8 transcript bytes including escape overhead', () => {
    const submission = { ...request.submission, turnId: 'new-turn', attemptId: 'new-attempt' };
    const turns = Array.from({ length: 7 }, (_, index) =>
      completeTurn(index, '\u0000'.repeat(10000))
    );
    expect(assistantTurnRequestSchema.safeParse({ ...request, submission, turns }).success).toBe(
      false
    );
  });
  it('rejects oversized frozen briefings and does not promote incomplete prefixes', () => {
    expect(
      assistantTurnRequestSchema.safeParse({
        ...request,
        briefing: { ...request.briefing, markdown: 'x'.repeat(15001) },
      }).success
    ).toBe(false);
    const turn = completeTurn(5);
    turn.attempts[0].prefix.complete = false;
    expect(assistantTurnRequestSchema.safeParse({ ...request, turns: [turn] }).success).toBe(false);
  });
});
