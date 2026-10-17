import type { MusicAdapter } from '@minstrel/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { ApiError } from '../common/api-error.js';
import { BackgroundWork } from '../common/background-work.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { DB, type Db } from '../db/db.module.js';
import { generations, tracks } from '../db/schema.js';
import { ProviderRegistry } from '../providers/registry.js';
import type { DecryptedConnection, MusicTaskResult, ProviderTrack } from '../providers/types.js';
import {
  connectionRemoved,
  contentRejected,
  generationFailed,
  providerTimeout,
  type Failure,
} from './failures.js';
import { GenerationsRepo, type GenerationRow } from './generations.repo.js';
import { TrackCopier } from './track-copier.js';
import {
  canMove,
  isTimedOut,
  JOB_DUE_STATES,
  nextPollDelaySeconds,
  SYNC_LEASE_SECONDS,
} from './rules.js';

// Spec §5.3 step 3. A callback, a read, and the daily sweep all call sync(). The lease makes sure
// that only one of them syncs a row at a time.
@Injectable()
export class SyncService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly repo: GenerationsRepo,
    private readonly connections: ConnectionsService,
    private readonly registry: ProviderRegistry,
    private readonly copier: TrackCopier,
    private readonly background: BackgroundWork,
  ) {}

  /** A read and the sweep pass ifDue, so a row that another sync just polled is not polled again. */
  async sync(generationId: string, opts: { ifDue?: boolean } = {}): Promise<void> {
    const row = await this.repo.claimLease(generationId, SYNC_LEASE_SECONDS, opts);
    if (!row) return;

    // A callback can come before submit saves provider_task_id. Submit sets the row due after that.
    if (row.flow !== 'job' || !JOB_DUE_STATES.includes(row.status) || !row.providerTaskId) {
      await this.releaseLease(row.id);
      return;
    }

    const conn = await this.connectionOf(row);
    if (!conn) {
      await this.fail(row.id, connectionRemoved());
      return;
    }
    // A generation always has a music adapter. registry.music() throws for any other adapter.
    const provider = this.registry.music(row.adapter as MusicAdapter);
    if (provider.flow !== 'job') {
      await this.releaseLease(row.id);
      return;
    }

    // The provider call is outside any transaction, so a slow provider never holds a lock.
    let result: MusicTaskResult | null = null;
    try {
      result = await provider.getTask(conn, row.providerTaskId);
    } catch {
      // A provider error is a missed poll. The backoff and the 30-minute limit decide what comes next.
    }

    // The lease ends SYNC_LEASE_SECONDS after the claim, so this is the database time of the claim.
    const now = new Date(row.leaseUntil!.getTime() - SYNC_LEASE_SECONDS * 1000);
    const failure = result ? failureOf(result, conn.label) : null;
    if (failure) {
      await this.fail(row.id, failure);
      return;
    }
    if (result?.state !== 'complete' && isTimedOut(row.createdAt, now)) {
      await this.fail(row.id, providerTimeout(conn.label));
      return;
    }

    const copies = await this.save(row, result);
    for (const trackId of copies) this.background.run(() => this.copier.copy(trackId));
  }

  /** One short transaction. It returns the IDs of the tracks to copy to R2. */
  private save(row: GenerationRow, result: MusicTaskResult | null): Promise<string[]> {
    const attempts = row.pollAttempts + 1;
    const status =
      result && canMove(row.status, result.state) ? result.state : row.status;
    const done = status === 'complete';

    return this.db.transaction(async (tx) => {
      const saved = result ? await this.upsertTracks(tx, row, result.tracks) : [];
      await tx
        .update(generations)
        .set({
          status,
          pollAttempts: attempts,
          nextPollAt: done
            ? null
            : sql`now() + make_interval(secs => ${nextPollDelaySeconds(attempts)})`,
          leaseUntil: null,
        })
        .where(eq(generations.id, row.id));
      // A first_ready URL can be a stream that still grows. So the copy starts at complete.
      return done ? saved.filter((t) => t.storageStatus === 'pending').map((t) => t.id) : [];
    });
  }

  private async upsertTracks(tx: Db, row: GenerationRow, list: ProviderTrack[]) {
    // One INSERT cannot update the same row twice, so each provider track goes in one time.
    const unique = [...new Map(list.map((t) => [t.providerTrackId, t])).values()];
    if (unique.length === 0) return [];
    const fallbackTitle = row.input.title || row.input.idea.slice(0, 80);
    return tx
      .insert(tracks)
      .values(
        unique.map((t) => ({
          generationId: row.id,
          userId: row.userId,
          providerTrackId: t.providerTrackId,
          title: t.title || fallbackTitle,
          style: row.input.style ?? null,
          lyrics: row.input.lyrics ?? null,
          durationSeconds: t.durationSeconds ?? null,
          providerAudioUrl: t.audioUrl,
          providerCoverUrl: t.coverUrl ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [tracks.generationId, tracks.providerTrackId],
        set: {
          title: sql`excluded.title`,
          durationSeconds: sql`excluded.duration_seconds`,
          providerAudioUrl: sql`excluded.provider_audio_url`,
          providerCoverUrl: sql`excluded.provider_cover_url`,
        },
        // A stored track already has its R2 copy. Its provider URLs stay null.
        setWhere: sql`${tracks.storageStatus} <> 'stored'`,
      })
      .returning({ id: tracks.id, storageStatus: tracks.storageStatus });
  }

  private async connectionOf(row: GenerationRow): Promise<DecryptedConnection | null> {
    if (!row.connectionId) return null;
    try {
      return await this.connections.decrypted(row.userId, row.connectionId);
    } catch (error) {
      // Any other error is not a removed key. The lease expires, and a later sync tries again.
      if (error instanceof ApiError && error.code === 'not_found') return null;
      throw error;
    }
  }

  private async fail(id: string, failure: Failure): Promise<void> {
    await this.db
      .update(generations)
      .set({
        status: 'failed',
        errorCode: failure.code,
        errorMessage: failure.message,
        nextPollAt: null,
        leaseUntil: null,
      })
      .where(eq(generations.id, id));
  }

  private async releaseLease(id: string): Promise<void> {
    await this.db.update(generations).set({ leaseUntil: null }).where(eq(generations.id, id));
  }
}

function failureOf(result: MusicTaskResult, label: string): Failure | null {
  if (result.state !== 'failed') return null;
  return result.failureCode === 'content_rejected'
    ? contentRejected(label)
    : generationFailed(label, result.reason);
}
