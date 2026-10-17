import { ApiClientError } from './api';

// A Neon cold start takes some seconds, so the gateway replies 502, 503 or 504, or the fetch fails.
// The query retries only these temporary failures. A 4xx or a 500 reply shows at once.
const MAX_TRIES = 6;
const TEMPORARY_STATUSES = new Set([502, 503, 504]);

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_TRIES - 1) return false;
  if (error instanceof ApiClientError) return TEMPORARY_STATUSES.has(error.status);
  // fetch throws a TypeError when the network fails.
  return error instanceof TypeError;
}

export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 5000);
}
