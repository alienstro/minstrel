import { canMove, isTimedOut, nextPollDelaySeconds } from './rules.js';

describe('generation rules', () => {
  it('the delays are 60, 120, then 300 for each later attempt', () => {
    expect([0, 1, 2, 3, 10].map(nextPollDelaySeconds)).toEqual([60, 120, 300, 300, 300]);
  });

  it('29:59 is not timed out and 30:00 is', () => {
    const created = new Date('2026-10-17T10:00:00Z');
    expect(isTimedOut(created, new Date('2026-10-17T10:29:59Z'))).toBe(false);
    expect(isTimedOut(created, new Date('2026-10-17T10:30:00Z'))).toBe(true);
  });

  it('pending can move to complete', () => {
    expect(canMove('pending', 'complete')).toBe(true);
    expect(canMove('submitting', 'first_ready')).toBe(true);
    expect(canMove('queued', 'running')).toBe(true);
  });

  it('complete cannot move to failed', () => {
    expect(canMove('complete', 'failed')).toBe(false);
  });

  it('a state cannot move back or across flows', () => {
    expect(canMove('first_ready', 'text_ready')).toBe(false);
    expect(canMove('pending', 'pending')).toBe(false);
    expect(canMove('pending', 'running')).toBe(false);
    expect(canMove('failed', 'complete')).toBe(false);
  });

  it('each state that is not complete can move to failed', () => {
    for (const from of ['submitting', 'pending', 'text_ready', 'first_ready', 'queued', 'running'] as const) {
      expect(canMove(from, 'failed')).toBe(true);
    }
  });
});
