import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { tracks } from '../db/schema.js';
import { SAFE_FETCH, type SafeFetch } from '../net/safe-fetch.js';
import { AUDIO_STORE, type AudioStore } from '../storage/audio-store.js';
import {
  AUDIO_MAX_BYTES,
  COVER_MAX_BYTES,
  normalizeAudioType,
  trackAudioKey,
  trackCoverKey,
} from '../storage/object-key.js';

// Spec §5.5.
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

@Injectable()
export class TrackCopier {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUDIO_STORE) private readonly store: AudioStore,
    @Inject(SAFE_FETCH) private readonly fetch: SafeFetch,
  ) {}

  /** Copies the provider audio and cover to R2. A failure is recorded on the row, never thrown. */
  async copy(trackId: string): Promise<void> {
    const [track] = await this.db.select().from(tracks).where(eq(tracks.id, trackId));
    if (!track || track.storageStatus === 'stored' || !track.providerAudioUrl) return;

    let audioKey: string;
    try {
      audioKey = await this.copyAudio(track.userId, track.id, track.providerAudioUrl);
    } catch {
      await this.db
        .update(tracks)
        .set({ storageStatus: 'copy_failed', copyAttempts: sql`${tracks.copyAttempts} + 1` })
        .where(eq(tracks.id, trackId));
      return;
    }

    const coverKey = track.providerCoverUrl
      ? await this.copyCover(track.userId, track.id, track.providerCoverUrl)
      : null;
    await this.db
      .update(tracks)
      .set({
        storageStatus: 'stored',
        audioKey,
        coverKey,
        providerAudioUrl: null,
        providerCoverUrl: null,
      })
      .where(eq(tracks.id, trackId));
  }

  private async copyAudio(userId: string, trackId: string, url: string): Promise<string> {
    const res = await this.download(url);
    const type = normalizeAudioType(res.headers.get('content-type'));
    const key = trackAudioKey(userId, trackId, type);
    await this.store.put(key, res.body, type, AUDIO_MAX_BYTES);
    return key;
  }

  /** The cover is optional: the UI shows a pattern without one. So a bad cover is skipped. */
  private async copyCover(userId: string, trackId: string, url: string): Promise<string | null> {
    try {
      const res = await this.download(url);
      const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (!type.startsWith('image/')) {
        await res.body.cancel();
        return null;
      }
      const key = trackCoverKey(userId, trackId);
      await this.store.put(key, res.body, type, COVER_MAX_BYTES);
      return key;
    } catch {
      return null;
    }
  }

  private async download(url: string) {
    const res = await this.fetch(url, { totalTimeoutMs: DOWNLOAD_TIMEOUT_MS });
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      throw new Error(`The download replied ${res.status}`);
    }
    return res as typeof res & { body: ReadableStream<Uint8Array> };
  }
}
