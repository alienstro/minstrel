import { randomUUID } from 'node:crypto';
import type { MusicAdapter } from '@minstrel/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { ApiError } from '../common/api-error.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { DB, type Db } from '../db/db.module.js';
import { generations, providerConnections, tracks } from '../db/schema.js';
import { mapProviderError } from '../providers/provider-error.js';
import { ProviderRegistry } from '../providers/registry.js';
import type { DecryptedConnection } from '../providers/types.js';
import { AUDIO_STORE, type AudioStore, TooLargeError } from '../storage/audio-store.js';
import { AUDIO_MAX_BYTES, normalizeAudioType, trackAudioKey } from '../storage/object-key.js';
import {
  connectionRemoved,
  generationFailed,
  interrupted,
  type Failure,
} from './failures.js';
import { GenerationsRepo, type GenerationRow } from './generations.repo.js';
import { DIRECT_ABORT_MS, DIRECT_LEASE_SECONDS, MAX_DIRECT_RUNNING } from './rules.js';

const EXPIRE_LIMIT = 100;

// Spec §5.4. A direct call costs the user money, so the runner never calls the provider twice for one
// generation. A function stops after 300 s, and waitUntil work counts in that time. So the runner does
// not chain the next queued song after a call: a read or the daily sweep starts it in a new function
// call (startQueued).
@Injectable()
export class DirectRunner {
  /** The provider call stops after this time. A test makes it short. */
  abortAfterMs = DIRECT_ABORT_MS;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUDIO_STORE) private readonly store: AudioStore,
    private readonly repo: GenerationsRepo,
    private readonly connections: ConnectionsService,
    private readonly registry: ProviderRegistry,
  ) {}

  /** Starts one queued generation when the user has a free place. Otherwise it stays queued. */
  async start(generationId: string): Promise<void> {
    const row = await this.claim(generationId);
    if (row) await this.run(row);
  }

  /** Starts the user's queued generations in creation order, while places are free. */
  async startQueued(userId: string): Promise<void> {
    const waiting = await this.db
      .select({ id: generations.id })
      .from(generations)
      .where(
        and(
          eq(generations.userId, userId),
          eq(generations.flow, 'direct'),
          eq(generations.status, 'queued'),
        ),
      )
      .orderBy(asc(generations.createdAt), asc(generations.id))
      .limit(MAX_DIRECT_RUNNING);
    // Claim one at a time, so the oldest song gets the first place. Then the calls run together.
    const claimed: GenerationRow[] = [];
    for (const { id } of waiting) {
      const row = await this.claim(id);
      if (!row) break;
      claimed.push(row);
    }
    await Promise.all(claimed.map((row) => this.run(row)));
  }

  /** Spec §5.4 step 3: a running row with an expired lease stopped with its instance. */
  async expire(userId?: string): Promise<void> {
    for (const row of await this.repo.expiredRunning(EXPIRE_LIMIT, userId)) {
      const failure = interrupted(await this.labelOf(row));
      await this.db
        .update(generations)
        .set({
          status: 'failed',
          errorCode: failure.code,
          errorMessage: failure.message,
          leaseUntil: null,
        })
        // The lease check again: only a row that is still running with an expired lease changes.
        .where(
          and(
            eq(generations.id, row.id),
            eq(generations.status, 'running'),
            lt(generations.leaseUntil, sql`now()`),
          ),
        );
    }
  }

  // Spec §5.4 step 2: one short transaction. The advisory lock on the user makes two starts for one
  // user count one after the other.
  private claim(generationId: string): Promise<GenerationRow | null> {
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ userId: generations.userId })
        .from(generations)
        .where(
          and(
            eq(generations.id, generationId),
            eq(generations.flow, 'direct'),
            eq(generations.status, 'queued'),
          ),
        );
      if (!target) return null;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${target.userId}, 0))`);
      const [{ running }] = (await tx
        .select({ running: sql<number>`count(*)::int` })
        .from(generations)
        .where(
          and(
            eq(generations.userId, target.userId),
            eq(generations.flow, 'direct'),
            eq(generations.status, 'running'),
          ),
        )) as [{ running: number }];
      if (running >= MAX_DIRECT_RUNNING) return null;
      // The lease (6 minutes) is longer than the 300 s function limit, so a live call never looks stopped.
      const [row] = await tx
        .update(generations)
        .set({
          status: 'running',
          leaseUntil: sql`now() + make_interval(secs => ${DIRECT_LEASE_SECONDS})`,
        })
        .where(
          and(
            eq(generations.id, generationId),
            eq(generations.status, 'queued'),
            or(isNull(generations.leaseUntil), lt(generations.leaseUntil, sql`now()`)),
          ),
        )
        .returning();
      return row ?? null;
    });
  }

  private async run(row: GenerationRow): Promise<void> {
    const conn = await this.connectionOf(row);
    if (!conn) {
      await this.fail(row.id, connectionRemoved());
      return;
    }
    const provider = this.registry.music(row.adapter as MusicAdapter);
    if (provider.flow !== 'direct') {
      await this.fail(row.id, generationFailed(conn.label, 'this provider has no direct flow'));
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`The call did not finish in ${this.abortAfterMs / 1000} s`)),
      this.abortAfterMs,
    );
    try {
      const [song] = await provider.compose(conn, row.input, controller.signal);
      if (!song) throw new Error('The provider gave no audio');
      // Spec §5.5: the body streams into R2. It never sits in memory as one buffer.
      const trackId = randomUUID();
      const type = normalizeAudioType(song.contentType);
      const audioKey = trackAudioKey(row.userId, trackId, type);
      await this.store.put(audioKey, song.body, type, AUDIO_MAX_BYTES);
      await this.db.transaction(async (tx) => {
        await tx.insert(tracks).values({
          id: trackId,
          generationId: row.id,
          userId: row.userId,
          providerTrackId: trackId,
          title: row.input.title || row.input.idea.slice(0, 80),
          style: row.input.style ?? null,
          lyrics: row.input.instrumental ? null : (row.input.lyrics ?? null),
          durationSeconds: song.durationSeconds ?? null,
          audioKey,
          storageStatus: 'stored',
        });
        await tx
          .update(generations)
          .set({ status: 'complete', leaseUntil: null })
          .where(and(eq(generations.id, row.id), eq(generations.status, 'running')));
      });
    } catch (error) {
      await this.fail(row.id, failureOf(error, conn.label, controller.signal));
    } finally {
      clearTimeout(timer);
    }
  }

  private async connectionOf(row: GenerationRow): Promise<DecryptedConnection | null> {
    if (!row.connectionId) return null;
    try {
      return await this.connections.decrypted(row.userId, row.connectionId);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'not_found') return null;
      throw error;
    }
  }

  /** The connection label that the user chose, or the provider name when the key is gone. */
  private async labelOf(row: GenerationRow): Promise<string> {
    if (row.connectionId) {
      const [conn] = await this.db
        .select({ label: providerConnections.label })
        .from(providerConnections)
        .where(eq(providerConnections.id, row.connectionId));
      if (conn) return conn.label;
    }
    return this.registry.music(row.adapter as MusicAdapter).displayName;
  }

  private async fail(id: string, failure: Failure): Promise<void> {
    await this.db
      .update(generations)
      .set({
        status: 'failed',
        errorCode: failure.code,
        errorMessage: failure.message,
        leaseUntil: null,
      })
      .where(and(eq(generations.id, id), eq(generations.status, 'running')));
  }
}

function failureOf(error: unknown, label: string, signal: AbortSignal): Failure {
  // Spec §8: a timeout is provider_unavailable.
  if (signal.aborted) return mapProviderError(0, '', label);
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  if (error instanceof TooLargeError) return generationFailed(label, 'the song file is larger than 50 MB');
  return generationFailed(label, 'Minstrel could not save the song');
}
