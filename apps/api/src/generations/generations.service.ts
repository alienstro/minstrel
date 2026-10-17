import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ADAPTER_KIND,
  createGenerationBodySchema,
  type GenerationDto,
  type GenerationInput,
  type MusicAdapter,
} from '@minstrel/shared';
import { eq, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { ApiError } from '../common/api-error.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { DB, type Db } from '../db/db.module.js';
import { generations } from '../db/schema.js';
import { mapProviderError } from '../providers/provider-error.js';
import { ProviderRegistry } from '../providers/registry.js';
import type { DecryptedConnection, JobMusicProvider } from '../providers/types.js';
import { toGenerationDto } from './generation.dto.js';
import type { GenerationRow } from './generations.repo.js';
import { nextPollDelaySeconds } from './rules.js';

export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

@Injectable()
export class GenerationsService {
  private readonly webOrigin: string;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly connections: ConnectionsService,
    private readonly registry: ProviderRegistry,
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
