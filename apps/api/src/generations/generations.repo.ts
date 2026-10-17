import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { generations } from '../db/schema.js';
import { JOB_DUE_STATES } from './rules.js';

export type GenerationRow = typeof generations.$inferSelect;

// Spec §5.3 and §5.4. Each time check uses Postgres now(), so the app clock of a function instance
// never decides a lease or a due poll.
@Injectable()
export class GenerationsRepo {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** One UPDATE ... RETURNING statement. It gives null when another worker holds a live lease. */
  async claimLease(id: string, seconds: number): Promise<GenerationRow | null> {
    const [row] = await this.db
      .update(generations)
      .set({ leaseUntil: sql`now() + make_interval(secs => ${seconds})` })
      .where(
        and(
          eq(generations.id, id),
          or(isNull(generations.leaseUntil), lt(generations.leaseUntil, sql`now()`)),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** The adapter and the callback token hash of a generation, for the webhook check. */
  async callbackTarget(
    id: string,
  ): Promise<{ adapter: string; callbackTokenHash: Buffer | null } | null> {
    const [row] = await this.db
      .select({ adapter: generations.adapter, callbackTokenHash: generations.callbackTokenHash })
      .from(generations)
      .where(eq(generations.id, id));
    return row ?? null;
  }

  /** Job generations that wait for a poll, the oldest poll time first. */
  dueJobGenerations(limit: number, userId?: string): Promise<GenerationRow[]> {
    return this.db
      .select()
      .from(generations)
      .where(
        and(
          eq(generations.flow, 'job'),
          inArray(generations.status, JOB_DUE_STATES),
          lte(generations.nextPollAt, sql`now()`),
          userId ? eq(generations.userId, userId) : undefined,
        ),
      )
      .orderBy(asc(generations.nextPollAt))
      .limit(limit);
  }

  /** Direct generations in running whose lease has expired, for example after the instance stopped. */
  expiredRunning(limit: number): Promise<GenerationRow[]> {
    return this.db
      .select()
      .from(generations)
      .where(
        and(
          eq(generations.flow, 'direct'),
          eq(generations.status, 'running'),
          lt(generations.leaseUntil, sql`now()`),
        ),
      )
      .orderBy(asc(generations.createdAt))
      .limit(limit);
  }
}
