import type { GenerationInput } from '@minstrel/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

// Spec §4.2–§4.5. Ids come from the Postgres 18 uuidv7() default. All times are timestamptz.

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

const id = () => uuid('id').primaryKey().default(sql`uuidv7()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' });

export const connectionKind = pgEnum('connection_kind', ['music', 'text']);
export const adapter = pgEnum('adapter', ['kie', 'openai_compatible']);
export const connectionStatus = pgEnum('connection_status', [
  'unchecked',
  'ok',
  'invalid_key',
  'unreachable',
]);
export const generationStatus = pgEnum('generation_status', [
  'submitting',
  'pending',
  'text_ready',
  'first_ready',
  'queued',
  'running',
  'complete',
  'failed',
]);
export const storageStatus = pgEnum('storage_status', ['pending', 'stored', 'copy_failed']);

export const providerConnections = pgTable(
  'provider_connections',
  {
    id: id(),
    userId: userId(),
    kind: connectionKind('kind').notNull(),
    adapter: adapter('adapter').notNull(),
    label: text('label').notNull(),
    baseUrl: text('base_url').notNull(),
    keyCiphertext: bytea('key_ciphertext').notNull(),
    keyIv: bytea('key_iv').notNull(),
    keyTag: bytea('key_tag').notNull(),
    keyVersion: smallint('key_version').notNull(),
    keyLast4: text('key_last4').notNull(),
    defaultModel: text('default_model'),
    status: connectionStatus('status').notNull().default('unchecked'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('provider_connections_user_label_idx').on(t.userId, t.label),
    check(
      'provider_connections_kind_matches_adapter',
      sql`(${t.kind} = 'text') = (${t.adapter} = 'openai_compatible')`,
    ),
  ],
);

export const generations = pgTable(
  'generations',
  {
    id: id(),
    userId: userId(),
    connectionId: uuid('connection_id').references(() => providerConnections.id, {
      onDelete: 'set null',
    }),
    adapter: adapter('adapter').notNull(),
    providerTaskId: text('provider_task_id'),
    callbackTokenHash: bytea('callback_token_hash'),
    status: generationStatus('status').notNull(),
    input: jsonb('input').$type<GenerationInput>().notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    nextPollAt: timestamp('next_poll_at', { withTimezone: true }),
    pollAttempts: integer('poll_attempts').notNull().default(0),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('generations_connection_task_idx').on(t.connectionId, t.providerTaskId),
    index('generations_status_next_poll_idx').on(t.status, t.nextPollAt),
    index('generations_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
);

export const tracks = pgTable(
  'tracks',
  {
    id: id(),
    generationId: uuid('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    userId: userId(),
    providerTrackId: text('provider_track_id').notNull(),
    title: text('title').notNull(),
    style: text('style'),
    lyrics: text('lyrics'),
    durationSeconds: numeric('duration_seconds', { mode: 'number' }),
    audioKey: text('audio_key'),
    coverKey: text('cover_key'),
    storageStatus: storageStatus('storage_status').notNull().default('pending'),
    copyAttempts: integer('copy_attempts').notNull().default(0),
    providerAudioUrl: text('provider_audio_url'),
    providerCoverUrl: text('provider_cover_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('tracks_generation_provider_track_idx').on(t.generationId, t.providerTrackId),
    index('tracks_user_created_idx').on(t.userId, t.createdAt.desc()),
  ],
);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  hits: integer('hits').notNull(),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
});
