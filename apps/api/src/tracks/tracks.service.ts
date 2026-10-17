import { Inject, Injectable, Logger } from '@nestjs/common';
import { renameTrackBodySchema, type Page, type TrackDto } from '@minstrel/shared';
import { and, desc, eq } from 'drizzle-orm';
import { ApiError, notFound } from '../common/api-error.js';
import { afterCursor, cursorTime, decodeCursor, toPage } from '../common/cursor.js';
import { isUuid } from '../common/is-uuid.js';
import { DB, type Db } from '../db/db.module.js';
import { tracks } from '../db/schema.js';
import { toTrackDto } from '../generations/generation.dto.js';
import type { TrackRow } from '../generations/generations.repo.js';
import { AUDIO_STORE, type AudioStore } from '../storage/audio-store.js';

const PAGE_SIZE = 50;

// Spec §9. Each method reads only the tracks of the user. Another user's track gives 404.
@Injectable()
export class TracksService {
  private readonly logger = new Logger(TracksService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUDIO_STORE) private readonly store: AudioStore,
  ) {}

  /** The Library, newest first. */
  async list(userId: string, cursor?: string): Promise<Page<TrackDto>> {
    const after = cursor
      ? afterCursor(tracks.createdAt, tracks.id, decodeCursor(cursor))
      : undefined;
    const rows = await this.db
      .select({ row: tracks, cursorTime: cursorTime(tracks.createdAt) })
      .from(tracks)
      .where(and(eq(tracks.userId, userId), after))
      .orderBy(desc(tracks.createdAt), desc(tracks.id))
      .limit(PAGE_SIZE + 1);
    return toPage(rows, PAGE_SIZE, toTrackDto);
  }

  async rename(userId: string, id: string, title: string): Promise<TrackDto> {
    const body = renameTrackBodySchema.parse({ title });
    if (!isUuid(id)) throw notFound();
    const [row] = await this.db
      .update(tracks)
      .set({ title: body.title })
      .where(this.ownTrack(userId, id))
      .returning();
    if (!row) throw notFound();
    return toTrackDto(row);
  }

  /** Deletes the row first. An R2 object that fails to delete stays under the user's prefix. */
  async remove(userId: string, id: string): Promise<void> {
    if (!isUuid(id)) throw notFound();
    const [row] = await this.db
      .delete(tracks)
      .where(this.ownTrack(userId, id))
      .returning({ audioKey: tracks.audioKey, coverKey: tracks.coverKey });
    if (!row) throw notFound();
    const keys = [row.audioKey, row.coverKey].filter((key): key is string => key !== null);
    const results = await Promise.allSettled(keys.map((key) => this.store.delete(key)));
    for (const r of results) {
      if (r.status === 'rejected') {
        // Account deletion removes the whole prefix, so the object does not stay for ever.
        this.logger.warn(`An R2 object of track ${id} was not deleted`);
      }
    }
  }

  /**
   * Spec §5.5: before the copy ends, the player uses the provider URL. After it, a signed R2 URL.
   * A download URL sets Content-Disposition: attachment with the track title as the file name.
   */
  async streamUrl(userId: string, id: string, opts: { download?: boolean } = {}): Promise<string> {
    const row = await this.find(userId, id);
    if (row.storageStatus === 'stored' && row.audioKey) {
      const ext = row.audioKey.split('.').pop();
      return this.store.signedUrl(
        row.audioKey,
        opts.download ? { downloadName: `${row.title}.${ext}` } : undefined,
      );
    }
    if (row.providerAudioUrl) return row.providerAudioUrl;
    throw new ApiError(404, 'not_found', 'This song has no audio yet.');
  }

  private async find(userId: string, id: string): Promise<TrackRow> {
    if (!isUuid(id)) throw notFound();
    const [row] = await this.db.select().from(tracks).where(this.ownTrack(userId, id));
    if (!row) throw notFound();
    return row;
  }

  private ownTrack(userId: string, id: string) {
    return and(eq(tracks.id, id), eq(tracks.userId, userId));
  }
}
