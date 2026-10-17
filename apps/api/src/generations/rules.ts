import type { GenerationStatus } from '@minstrel/shared';

// Spec §5.2–§5.4. Pure rules, so that the sync, the reads, and the sweep agree.

export const TIMEOUT_MS = 30 * 60_000;
// One getTask call ends in 30 s (API_TIMEOUT_MS in envelope.ts), so the lease leaves 60 s for the save.
export const SYNC_LEASE_SECONDS = 90;
export const DIRECT_LEASE_SECONDS = 6 * 60;
export const DIRECT_ABORT_MS = 240_000;
export const MAX_DIRECT_RUNNING = 4;

const DELAYS = [60, 120] as const;

/** `attempts` is the number of polls already done. */
export function nextPollDelaySeconds(attempts: number): 60 | 120 | 300 {
  return DELAYS[attempts] ?? 300;
}

export function isTimedOut(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() >= TIMEOUT_MS;
}

// The order of each flow. The sync can skip states, for example pending to complete.
const JOB: GenerationStatus[] = ['submitting', 'pending', 'text_ready', 'first_ready', 'complete'];
const DIRECT: GenerationStatus[] = ['queued', 'running', 'complete'];

export function canMove(from: GenerationStatus, to: GenerationStatus): boolean {
  if (from === 'complete' || from === 'failed' || from === to) return false;
  if (to === 'failed') return true;
  const flow = JOB.includes(from) ? JOB : DIRECT;
  const fromIndex = flow.indexOf(from);
  const toIndex = flow.indexOf(to);
  return toIndex > fromIndex && fromIndex >= 0;
}

export const JOB_DUE_STATES: GenerationStatus[] = ['pending', 'text_ready', 'first_ready'];
