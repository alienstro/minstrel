import type { ErrorCode, GenerationDto, MusicAdapter, TrackDto } from '@minstrel/shared';
import type { tracks } from '../db/schema.js';
import type { GenerationRow } from './generations.repo.js';

type TrackRow = typeof tracks.$inferSelect;

// The DTOs leave out the provider IDs, the callback hash, the lease, and the provider URLs.
export function toTrackDto(row: TrackRow): TrackDto {
  return {
    id: row.id,
    generationId: row.generationId,
    title: row.title,
    style: row.style,
    lyrics: row.lyrics,
    durationSeconds: row.durationSeconds,
    storageStatus: row.storageStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toGenerationDto(row: GenerationRow, trackRows: TrackRow[] = []): GenerationDto {
  return {
    id: row.id,
    connectionId: row.connectionId,
    adapter: row.adapter as MusicAdapter,
    flow: row.flow,
    status: row.status,
    input: row.input,
    error: row.errorCode
      ? { code: row.errorCode as ErrorCode, message: row.errorMessage ?? '' }
      : null,
    tracks: trackRows.map(toTrackDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
