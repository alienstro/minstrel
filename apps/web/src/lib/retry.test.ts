import { describe, expect, it } from 'vitest';
import { ApiClientError } from './api';
import { retryDelay, shouldRetry } from './retry';

const reply = (status: number) => new ApiClientError(status, 'internal_error', 'Something went wrong. Try again.');

describe('shouldRetry', () => {
  it('retries a network error', () => {
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
  });

  it('retries a 502, 503, and 504 reply', () => {
    for (const status of [502, 503, 504]) expect(shouldRetry(0, reply(status))).toBe(true);
  });

  it('does not retry a 4xx reply', () => {
    for (const status of [400, 401, 403, 404, 429]) expect(shouldRetry(0, reply(status))).toBe(false);
  });

  it('does not retry a 500 reply', () => {
    expect(shouldRetry(0, reply(500))).toBe(false);
  });

  // TanStack Query passes the count of failures so far, so 5 failures with a retry each make 6 tries.
  it('stops after 6 tries', () => {
    expect(shouldRetry(4, reply(503))).toBe(true);
    expect(shouldRetry(5, reply(503))).toBe(false);
  });
});

describe('retryDelay', () => {
  it('the delay grows and stops at 5000 ms', () => {
    const delays = [0, 1, 2, 3, 4].map(retryDelay);
    expect(delays).toEqual([1000, 2000, 4000, 5000, 5000]);
  });
});
