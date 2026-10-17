import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ADAPTER_KIND,
  createGenerationBodySchema,
  type GenerationDto,
  type GenerationInput,
  type MusicAdapter,
  type Page,
} from '@minstrel/shared';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { ApiError, notFound } from '../common/api-error.js';
import { BackgroundWork } from '../common/background-work.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { DB, type Db } from '../db/db.module.js';
import { generations } from '../db/schema.js';
import { mapProviderError } from '../providers/provider-error.js';
import { ProviderRegistry } from '../providers/registry.js';
import type { DecryptedConnection, JobMusicProvider } from '../providers/types.js';
import { toGenerationDto } from './generation.dto.js';
import { GenerationsRepo, type GenerationRow } from './generations.repo.js';
import { nextPollDelaySeconds } from './rules.js';
import { SyncService } from './sync.service.js';

const PAGE_SIZE = 20;
const MAX_SYNCS_PER_LIST = 5;

const isUuid = (value: string) => z.uuid().safeParse(value).success;

export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

@Injectable()
export class GenerationsService {
  private readonly webOrigin: string;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly connections: ConnectionsService,
    private readonly registry: ProviderRegistry,
    private readonly repo: GenerationsRepo,
    private readonly syncService: SyncService,
    private readonly background: BackgroundWork,
  ) {
    const origin = process.env.WEB_ORIGIN;
    if (!origin) throw new Error('WEB_ORIGIN must be set');
    this.webOrigin = origin;
  }

  async create(userId: string, body: unknown): Promise<GenerationDto> {
    const { connectionId, input: rawInput } = createGenerationBodySchema.parse(body);
    const conn = await this.connections.decrypted(userId, connectionId);
    if (ADAPTER_KIND[conn.adapter] !== 'music') {
      const message = 'Choose a music provider key to make a song.';
      throw new ApiError(400, 'invalid_input', message, { connectionId: message });
    }
    const provider = this.registry.music(conn.adapter as MusicAdapter);
    // Spec §5.1: the limits depend on the adapter of the connection.
    const input = provider.inputSchema.parse(rawInput);
    if (provider.flow !== 'job') {
      throw new ApiError(400, 'invalid_input', 'Minstrel does not support this music provider yet.');
    }
    return toGenerationDto(await this.submitJob(conn, provider, input));
  }

  // Spec §5.3 step 4. Vercel Cron runs once a day on Hobby, so the reads drive the poll. The reply
  // never waits for the sync. The Studio page reads again 3 s later and sees the new state.
  async get(userId: string, id: string): Promise<GenerationDto> {
    if (!isUuid(id)) throw notFound();
    const found = await this.repo.findForUser(id, userId);
    if (!found) throw notFound();
    if (found.due) this.scheduleSync(id);
    return toGenerationDto(found.row, await this.repo.tracksOf([id]));
  }

  async list(userId: string, cursor?: string): Promise<Page<GenerationDto>> {
    if (cursor !== undefined && !isUuid(cursor)) {
      throw new ApiError(400, 'invalid_input', 'This page link is not valid.', { cursor: 'Not valid.' });
    }
    // One extra row tells if a next page exists.
    const rows = await this.repo.pageForUser(userId, PAGE_SIZE + 1, cursor);
    const page = rows.slice(0, PAGE_SIZE);
    for (const due of await this.repo.dueJobGenerations(MAX_SYNCS_PER_LIST, userId)) {
      this.scheduleSync(due.id);
    }
    const trackRows = await this.repo.tracksOf(page.map((g) => g.id));
    return {
      items: page.map((g) =>
        toGenerationDto(g, trackRows.filter((t) => t.generationId === g.id)),
      ),
      nextCursor: rows.length > PAGE_SIZE ? page.at(-1)!.id : null,
    };
  }

  private scheduleSync(id: string): void {
    this.background.run(() => this.syncService.sync(id, { ifDue: true }));
  }

  // Spec §5.3 step 1.
  private async submitJob(
    conn: DecryptedConnection,
    provider: JobMusicProvider,
    input: GenerationInput,
  ): Promise<GenerationRow> {
    // The URL carries the token. The row keeps only its SHA-256 hash.
    const token = provider.supportsCallback ? randomBytes(32).toString('base64url') : null;
    const [created] = await this.db
      .insert(generations)
      .values({
        userId: conn.userId,
        connectionId: conn.id,
        adapter: conn.adapter,
        flow: 'job',
        status: 'submitting',
        input,
        callbackTokenHash: token ? hashToken(token) : null,
      })
      .returning();
    const id = created!.id;
    const callbackUrl = token
      ? `${this.webOrigin}/api/webhooks/${conn.adapter}/${id}?t=${token}`
      : undefined;

    try {
      const { taskId } = await provider.submit(conn, input, callbackUrl);
      return await this.update(id, {
        providerTaskId: taskId,
        status: 'pending',
        nextPollAt: sql`now() + make_interval(secs => ${nextPollDelaySeconds(0)})`,
      });
    } catch (error) {
      const failure = error instanceof ApiError ? error : mapProviderError(0, '', conn.label);
      return this.update(id, {
        status: 'failed',
        errorCode: failure.code,
        errorMessage: failure.message,
      });
    }
  }

  private async update(
    id: string,
    values: PgUpdateSetSource<typeof generations>,
  ): Promise<GenerationRow> {
    const [row] = await this.db
      .update(generations)
      .set(values)
      .where(eq(generations.id, id))
      .returning();
    return row!;
  }
}
