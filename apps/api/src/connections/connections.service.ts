import { Inject, Injectable } from '@nestjs/common';
import {
  ADAPTER_KIND,
  type Adapter,
  type ConnectionDto,
  createConnectionBodySchema,
  type ModelOption,
  updateConnectionBodySchema,
} from '@minstrel/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { ApiError, notFound } from '../common/api-error.js';
import { KeyVault } from '../crypto/key-vault.js';
import { DB, type Db } from '../db/db.module.js';
import { providerConnections } from '../db/schema.js';
import { ProviderRegistry } from '../providers/registry.js';
import type { DecryptedConnection } from '../providers/types.js';

type Row = typeof providerConnections.$inferSelect;

const LABEL_TAKEN =
  'You already have a connection with this label. Choose another label.';

// Spec §4.2, §4.6, and §7.1. Each query filters on the session user. A key leaves this service only
// as a DecryptedConnection for a provider call.
@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly vault: KeyVault,
    private readonly registry: ProviderRegistry,
  ) {}

  async list(userId: string): Promise<ConnectionDto[]> {
    const rows = await this.db
      .select()
      .from(providerConnections)
      .where(eq(providerConnections.userId, userId))
      .orderBy(desc(providerConnections.createdAt));
    return rows.map(toDto);
  }

  async create(userId: string, input: unknown): Promise<ConnectionDto> {
    const body = createConnectionBodySchema.parse(input);
    if (ADAPTER_KIND[body.adapter] !== body.kind) {
      throw new ApiError(
        400,
        'invalid_input',
        'This provider does not match the kind.',
        {
          kind: `This provider is a ${ADAPTER_KIND[body.adapter]} provider.`,
        },
      );
    }
    // The AAD holds the connection ID, so the ID comes from Postgres before the encryption.
    const { rows } = await this.db.execute<{ id: string }>(
      sql`SELECT uuidv7() AS id`,
    );
    const id = rows[0]!.id;
    const sealed = this.vault.encrypt(body.apiKey, aad(userId, id));
    const [row] = await this.withLabelCheck(() =>
      this.db
        .insert(providerConnections)
        .values({
          id,
          userId,
          kind: body.kind,
          adapter: body.adapter,
          label: body.label,
          baseUrl: body.baseUrl ?? this.defaultBaseUrl(body.adapter),
          keyCiphertext: sealed.ciphertext,
          keyIv: sealed.iv,
          keyTag: sealed.tag,
          keyVersion: sealed.version,
          keyLast4: body.apiKey.slice(-4),
          defaultModel: body.defaultModel ?? null,
        })
        .returning(),
    );
    return toDto(row!);
  }

  async update(
    userId: string,
    id: string,
    input: unknown,
  ): Promise<ConnectionDto> {
    const body = updateConnectionBodySchema.parse(input);
    await this.row(userId, id);
    const changes: Partial<typeof providerConnections.$inferInsert> = {};
    if (body.label !== undefined) changes.label = body.label;
    if (body.defaultModel !== undefined)
      changes.defaultModel = body.defaultModel;
    if (body.baseUrl !== undefined) {
      changes.baseUrl = body.baseUrl;
      changes.status = 'unchecked';
    }
    if (body.apiKey !== undefined) {
      const sealed = this.vault.encrypt(body.apiKey, aad(userId, id));
      Object.assign(changes, {
        keyCiphertext: sealed.ciphertext,
        keyIv: sealed.iv,
        keyTag: sealed.tag,
        keyVersion: sealed.version,
        keyLast4: body.apiKey.slice(-4),
        status: 'unchecked',
      });
    }
    if (Object.keys(changes).length === 0)
      return toDto(await this.row(userId, id));
    const [row] = await this.withLabelCheck(() =>
      this.db
        .update(providerConnections)
        .set(changes)
        .where(owned(userId, id))
        .returning(),
    );
    if (!row) throw notFound();
    return toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(providerConnections)
      .where(owned(userId, id))
      .returning({ id: providerConnections.id });
    if (deleted.length === 0) throw notFound();
  }

  async test(userId: string, id: string): Promise<ConnectionDto> {
    const conn = await this.decrypted(userId, id);
    const check =
      ADAPTER_KIND[conn.adapter] === 'text'
        ? await this.registry.text().checkConnection(conn)
        : await this.registry
            .music(conn.adapter as Exclude<Adapter, 'openai_compatible'>)
            .checkConnection(conn);
    const [row] = await this.db
      .update(providerConnections)
      .set({
        status: check.ok ? 'ok' : check.status,
        lastCheckedAt: sql`now()`,
      })
      .where(owned(userId, id))
      .returning();
    if (!row) throw notFound();
    return toDto(row);
  }

  async models(userId: string, id: string): Promise<ModelOption[]> {
    const conn = await this.decrypted(userId, id);
    if (ADAPTER_KIND[conn.adapter] === 'text')
      return this.registry.text().listModels(conn);
    return this.registry
      .music(conn.adapter as Exclude<Adapter, 'openai_compatible'>)
      .listModels();
  }

  async decrypted(userId: string, id: string): Promise<DecryptedConnection> {
    const row = await this.row(userId, id);
    const apiKey = this.vault.decrypt(
      {
        ciphertext: row.keyCiphertext,
        iv: row.keyIv,
        tag: row.keyTag,
        version: row.keyVersion,
      },
      aad(userId, id),
    );
    return {
      id: row.id,
      userId: row.userId,
      adapter: row.adapter,
      label: row.label,
      baseUrl: row.baseUrl,
      apiKey,
      defaultModel: row.defaultModel,
    };
  }

  private async row(userId: string, id: string): Promise<Row> {
    if (!isUuid(id)) throw notFound();
    const [row] = await this.db
      .select()
      .from(providerConnections)
      .where(owned(userId, id));
    if (!row) throw notFound();
    return row;
  }

  private defaultBaseUrl(adapter: Adapter): string {
    return adapter === 'openai_compatible'
      ? this.registry.text().defaultBaseUrl
      : this.registry.music(adapter).defaultBaseUrl;
  }

  // The unique index on (user_id, label) decides, so two requests at the same time cannot both win.
  private async withLabelCheck<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      const cause =
        (error as { cause?: { code?: string; constraint?: string } }).cause ??
        error;
      if ((cause as { code?: string }).code === '23505') {
        throw new ApiError(400, 'invalid_input', LABEL_TAKEN, {
          label: LABEL_TAKEN,
        });
      }
      throw error;
    }
  }
}

const aad = (userId: string, connectionId: string) =>
  `${userId}:${connectionId}`;

const owned = (userId: string, id: string) =>
  and(eq(providerConnections.id, id), eq(providerConnections.userId, userId));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

function toDto(row: Row): ConnectionDto {
  return {
    id: row.id,
    kind: row.kind,
    adapter: row.adapter,
    label: row.label,
    baseUrl: row.baseUrl,
    keyLast4: row.keyLast4,
    defaultModel: row.defaultModel,
    status: row.status,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
