import { Inject, Injectable, Logger } from '@nestjs/common';
import { lt, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { rateLimits } from '../db/schema.js';
import { GenerationsRepo } from './generations.repo.js';
import { SyncService } from './sync.service.js';
import { TrackCopier } from './track-copier.js';

// Spec §5.3 step 5. A Hobby function stops after 300 s, so no new work starts after 240 s.
// The next sweep continues the work.
export const SWEEP_BUDGET_MS = 240_000;
const PARALLEL = 5;
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
  ) {}

  /** `clock` gives milliseconds. Only the time between two readings counts. */
  async run(clock: () => number = Date.now): Promise<SweepResult> {
    const deadline = clock() + SWEEP_BUDGET_MS;
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

    // 3. The direct flow steps of spec §5.4 come with the direct flow (plan Task 50b).

    // 4. Delete the rate_limits rows that ended.
    if (!inTime()) return { ...result, stopped: true };
    const deleted = await this.db
      .delete(rateLimits)
      .where(lt(rateLimits.resetAt, sql`now()`))
      .returning({ key: rateLimits.key });
    result.rateLimitsDeleted = deleted.length;
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
