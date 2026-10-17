import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { afterCursor, cursorTime, decodeCursor } from '../common/cursor.js';
import { DB, type Db } from '../db/db.module.js';
import { generations, tracks } from '../db/schema.js';
import { JOB_DUE_STATES } from './rules.js';

export type GenerationRow = typeof generations.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;

// Spec §5.3 step 4: a job generation is due in pending, text_ready, or first_ready at next_poll_at.
const isDue = and(
  eq(generations.flow, 'job'),
  inArray(generations.status, JOB_DUE_STATES),
  lte(generations.nextPollAt, sql`now()`),
)!;

// Spec §5.3 and §5.4. Each time check uses Postgres now(), so the app clock of a function instance
// never decides a lease or a due poll.
@Injectable()
export class GenerationsRepo {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * One UPDATE ... RETURNING statement. It gives null when another worker holds a live lease.
   * With ifDue, it also gives null when the row is not due, for example after another sync polled it.
   */
  async claimLease(
    id: string,
    seconds: number,
    opts: { ifDue?: boolean } = {},
  ): Promise<GenerationRow | null> {
    const [row] = await this.db
      .update(generations)
      .set({ leaseUntil: sql`now() + make_interval(secs => ${seconds})` })
      .where(
        and(
          eq(generations.id, id),
          or(isNull(generations.leaseUntil), lt(generations.leaseUntil, sql`now()`)),
          opts.ifDue ? isDue : undefined,
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
      .where(and(isDue, userId ? eq(generations.userId, userId) : undefined))
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

  /** One generation of the user, and whether it is due now. */
  async findForUser(
    id: string,
    userId: string,
  ): Promise<{ row: GenerationRow; due: boolean } | null> {
    const [found] = await this.db
      .select({ row: generations, due: sql<boolean>`coalesce(${isDue}, false)` })
      .from(generations)
      .where(and(eq(generations.id, id), eq(generations.userId, userId)));
    return found ?? null;
  }

  /** A page of the user's generations, newest first, with one extra row (see toPage). */
  pageForUser(userId: string, limit: number, cursor?: string) {
    const after = cursor
      ? afterCursor(generations.createdAt, generations.id, decodeCursor(cursor))
      : undefined;
    return this.db
      .select({ row: generations, cursorTime: cursorTime(generations.createdAt) })
      .from(generations)
      .where(and(eq(generations.userId, userId), after))
      .orderBy(desc(generations.createdAt), desc(generations.id))
      .limit(limit + 1);
  }

  /** The tracks of the generations, in the order the provider gave them. */
  tracksOf(generationIds: string[]): Promise<TrackRow[]> {
    if (generationIds.length === 0) return Promise.resolve([]);
    return this.db
      .select()
      .from(tracks)
      .where(inArray(tracks.generationId, generationIds))
      .orderBy(asc(tracks.createdAt), asc(tracks.providerTrackId));
  }

  /**
   * Spec §5.3 step 5.2: tracks to copy again. Only tracks of complete generations, because the
   * sync starts the copy at complete.
   */
  async retryableTracks(maxAttempts: number, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: tracks.id })
      .from(tracks)
      .innerJoin(generations, eq(generations.id, tracks.generationId))
      .where(
        and(
          inArray(tracks.storageStatus, ['pending', 'copy_failed']),
          lt(tracks.copyAttempts, maxAttempts),
          isNotNull(tracks.providerAudioUrl),
          eq(generations.status, 'complete'),
        ),
      )
      .orderBy(asc(tracks.createdAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }
}
