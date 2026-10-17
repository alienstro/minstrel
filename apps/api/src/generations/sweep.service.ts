import { Inject, Injectable, Logger } from '@nestjs/common';
import { lt, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { rateLimits } from '../db/schema.js';
import { DirectRunner } from './direct-runner.js';
import { GenerationsRepo } from './generations.repo.js';
import { SyncService } from './sync.service.js';
import { TrackCopier } from './track-copier.js';

// Spec §5.3 step 5. A Hobby function stops after 300 s, so no new work starts after 240 s.
// The next sweep continues the work.
export const SWEEP_BUDGET_MS = 240_000;
const PARALLEL = 5;
// A direct call can take 240 s, and the function stops at 300 s. So the sweep starts direct calls
// only in its first 30 s. Later, a read starts them.
const DIRECT_START_WINDOW_MS = 30_000;
const MAX_COPY_ATTEMPTS = 5;
// One sweep reads at most this many rows for each step.
const LIST_LIMIT = 500;

export interface SweepResult {
  synced: number;
  copied: number;
  rateLimitsDeleted: number;
  /** True when the sweep stopped at the time limit before it did all the work. */
  stopped: boolean;
}

@Injectable()
export class SweepService {
  private readonly logger = new Logger(SweepService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly repo: GenerationsRepo,
    private readonly syncService: SyncService,
    private readonly copier: TrackCopier,
    private readonly runner: DirectRunner,
  ) {}

  /** `clock` gives milliseconds. Only the time between two readings counts. */
  async run(clock: () => number = Date.now): Promise<SweepResult> {
    const startedAt = clock();
    const deadline = startedAt + SWEEP_BUDGET_MS;
    const inTime = () => clock() <= deadline;
    const result: SweepResult = { synced: 0, copied: 0, rateLimitsDeleted: 0, stopped: false };

    // 1. Sync each due job generation.
    const due = await this.repo.dueJobGenerations(LIST_LIMIT);
    result.synced = await this.inBatches(
      due.map((g) => g.id),
      (id) => this.syncService.sync(id, { ifDue: true }),
      inTime,
    );
    if (result.synced < due.length) return { ...result, stopped: true };

    // 2. Copy the tracks again that are not stored yet.
    const retry = inTime() ? await this.repo.retryableTracks(MAX_COPY_ATTEMPTS, LIST_LIMIT) : null;
    if (!retry) return { ...result, stopped: true };
    result.copied = await this.inBatches(retry, (id) => this.copier.copy(id), inTime);
    if (result.copied < retry.length) return { ...result, stopped: true };

    // 3. Spec §5.4 steps 3 and 4: mark stopped direct calls, then start queued songs. The calls run
    // while step 4 works, and the sweep waits for them at the end.
    if (!inTime()) return { ...result, stopped: true };
    await this.runner.expire();
    let direct: Promise<unknown> = Promise.resolve();
    if (clock() - startedAt <= DIRECT_START_WINDOW_MS) {
      const users = await this.repo.usersWithQueuedDirect(LIST_LIMIT);
      direct = Promise.allSettled(users.map((userId) => this.runner.startQueued(userId)));
    }

    // 4. Delete the rate_limits rows that ended.
    if (inTime()) {
      const deleted = await this.db
        .delete(rateLimits)
        .where(lt(rateLimits.resetAt, sql`now()`))
        .returning({ key: rateLimits.key });
      result.rateLimitsDeleted = deleted.length;
    } else {
      result.stopped = true;
    }
    await direct;
    return result;
  }

  /** Runs `work` for PARALLEL IDs at a time. It returns how many IDs it started. */
  private async inBatches(
    ids: string[],
    work: (id: string) => Promise<void>,
    inTime: () => boolean,
  ): Promise<number> {
    let started = 0;
    while (started < ids.length && inTime()) {
      const batch = ids.slice(started, started + PARALLEL);
      started += batch.length;
      // One failed item does not stop the sweep. Its row stays due for the next read or sweep.
      const results = await Promise.allSettled(batch.map(work));
      for (const r of results) {
        if (r.status === 'rejected') {
          this.logger.error('Sweep item failed', r.reason instanceof Error ? r.reason.stack : r.reason);
        }
      }
    }
    return started;
  }
}
