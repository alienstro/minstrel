# Minstrel v1 — Design Spec

- **Date:** 2026-10-16
- **Status:** Draft for review
- **Repository:** `alienstro/minstrel` (pnpm + Turborepo: `apps/web`, `apps/api`, `packages/shared`)

## 1. Goal and scope

Minstrel is a hosted web app. A user signs in, adds their own AI provider keys, writes a song idea, and gets
songs that they can play and keep. Each user pays their own providers. The host pays only for hosting and
storage.

### 1.1 In scope for v1

1. **Generate songs** with any music provider that has an adapter. Music APIs have no common standard, so
   each one needs its own small adapter class (§3.2). v1 ships three adapters:
   - `kie`: kie.ai (Suno models).
   - `suno_classic`: sunoapi.org and other resellers that use the classic Suno API shape. The user can change
     the base URL.
   - `elevenlabs`: ElevenLabs Music (paid ElevenLabs plans only).
2. **Lyric and prompt helper.** A text model writes or improves lyrics, a style, and a title. The adapter is
   OpenAI-compatible, so it works with any provider that has that API: OpenRouter, OpenAI, Groq, Together,
   DeepSeek, kie.ai chat models, and others. The user enters only a base URL, a key, and a model.
3. **Library and player.** The user plays, renames, downloads, and deletes their songs.
4. **Accounts.** Sign-in, provider keys, and account deletion.

### 1.2 Out of scope for v1

- Edit tools: extend, cover, vocal separation, WAV conversion, music video.
- Public song pages, sharing, likes, and comments.
- Payments, plans, and teams.
- Streamed lyric output (the helper returns the full result in one response).
- More music adapters. The `MusicProvider` interface supports them, so each one is one new class after v1.
- Suno's official API. In 2026-10 it is invite-only with no public docs. Add a `suno` adapter when Suno
  publishes it.
- Unofficial Suno wrappers that copy Suno's private app API. They break Suno's terms of service.
- ElevenLabs composition plans. v1 sends a text prompt only.
- A "generic HTTP" music adapter where users map JSON fields by hand. It breaks easily and is hard to secure.
- Provider endpoints on a private network, for example a local Ollama server (see §7.3).

### 1.3 Success criteria

- A new user can sign up, add a music provider key, and play a generated song in less than 5 minutes.
- A song still plays 30 days after generation (kie.ai and sunoapi.org delete their files after 14 days).
- If the function instance stops during a paid direct call (ElevenLabs), the API does not repeat the call.
- No API path returns a stored provider key, and no log line contains one.
- A lost provider callback, or a provider without callbacks, does not leave a generation stuck. While the
  user has Minstrel open, a sync on read completes it or marks it failed within 30 minutes. Otherwise the
  user's next visit or the daily sweep does it, within 24 hours (§5.3).

## 2. Infrastructure

Vercel hosts the web app and the API in one project with Vercel Services (beta). Neon hosts Postgres.
Cloudflare R2 keeps the audio.

### 2.1 Address and plan

`<name>.to` is the owner's domain. Its DNS stays on Cloudflare.

| Path on `minstrel.<name>.to` | Runs | Vercel service |
|---|---|---|
| `/api/*` | NestJS API, one Vercel Function on Fluid compute | `api` (root `apps/api/`) |
| Each other path | Next.js web app | `web` (root `apps/web/`) |

- The Cloudflare record for `minstrel` is a CNAME to Vercel with the proxy off (DNS only). Vercel issues
  the certificate.
- The project uses the Vercel Hobby plan. Three Hobby limits shape this design:
  - Vercel Cron runs at most once per day, at a time within the hour (§5.3).
  - A function stops after 300 s, so a direct call must end before that (§5.4).
  - Hobby allows non-commercial use only. Move to Pro before Minstrel takes payments or shows ads.

### 2.2 Request paths

```
Browser ──► minstrel.<name>.to/*         Vercel ──► service web (Next.js)
Browser ──► minstrel.<name>.to/api/*     Vercel ──► service api (NestJS)
Music provider ──► minstrel.<name>.to/api/webhooks/<adapter>/*   (only providers with callbacks)
Vercel Cron ──► minstrel.<name>.to/api/cron/sweep                (once per day, production only)
service api ──► Neon Postgres (pooled connection)
service api ──► music and text providers (kie.ai, OpenRouter, any other), Cloudflare R2   (outbound)
Browser ──► R2 signed URL                  audio stream and download
```

- The browser uses one origin only, so CORS is not necessary. Next.js has no `rewrites()` for the API.
- The `api` service gets the full path, for example `/api/generations`. NestJS keeps the global prefix `api`.
- The session cookie is host-only on `minstrel.<name>.to`.
- Audio does not go through Vercel. The browser gets it from R2 with signed URLs.

### 2.3 Vercel project

`vercel.json` at the repository root:

```json
{
  "services": {
    "web": { "root": "apps/web/" },
    "api": { "root": "apps/api/", "entrypoint": "src/main.ts" }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)", "destination": { "service": "web" } }
  ],
  "crons": [{ "path": "/api/cron/sweep", "schedule": "0 4 * * *" }]
}
```

Rules:

- Fluid compute stays on. It is the default for new projects. On Hobby, the default `maxDuration` is
  also the maximum, 300 s, so `vercel.json` does not set it.
- Put the functions and the Neon database in the same region, for example `iad1` and Neon `aws-us-east-1`.
- Vercel Cron calls the production deployment only. It sends `Authorization: Bearer <CRON_SECRET>`. The cron
  route is `@AllowAnonymous`, and it compares the token with `crypto.timingSafeEqual`.
- Deployment Protection blocks provider callbacks to a preview, and Vercel Cron does not call a preview.
  A job song made on a preview still finishes while the Studio page is open, because of the sync on read
  (§5.3).

Check these items at the first preview deploy, because the Vercel docs do not state them for services:

1. A top-level `crons` entry reaches the `api` service through the `/api/(.*)` rewrite.
2. Both services build `packages/shared` from the pnpm workspace.

### 2.4 Database (Neon)

- Add Neon from the Vercel Marketplace, with Postgres 18. The integration sets `DATABASE_URL` (pooled)
  and `DATABASE_URL_UNPOOLED` (direct).
- Turn on the integration option that makes one Neon branch for each preview deployment. A preview
  migration then never touches production data.
- The API uses a `pg` `Pool` on `DATABASE_URL`. `attachDatabasePool` from `@vercel/functions` closes idle
  clients before Vercel suspends an instance.
- The `api` build command runs `drizzle-kit migrate` with `DATABASE_URL_UNPOOLED`.
- Neon point-in-time restore replaces the nightly `pg_dump`. The restore window depends on the Neon plan,
  and the Free plan keeps only a short window. Choose the plan before launch, then do one restore test.
- Local development uses Postgres 18 in Docker.

### 2.5 Environment variables

The two services share the project's environment variables. Only `NEXT_PUBLIC_*` names reach the browser,
so no secret uses that prefix.

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled connection string. The Neon integration sets it. |
| `DATABASE_URL_UNPOOLED` | Neon direct connection string, for migrations only. The Neon integration sets it. |
| `WEB_ORIGIN` | `https://minstrel.<name>.to`. Better Auth `baseURL`, trusted origin, and base of the provider callback URLs. |
| `CRON_SECRET` | 32+ random bytes. Vercel Cron sends it as a bearer token. |
| `BETTER_AUTH_SECRET` | Better Auth signing secret, 32+ random bytes |
| `KEY_ENCRYPTION_KEYS` | Master keys for provider keys, for example `1:<base64 32 bytes>`. The highest version encrypts. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email for verification and password reset |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Audio storage |

## 3. Architecture

### 3.1 Units

| Unit | Location | Job |
|---|---|---|
| Shared contracts | `packages/shared` | Zod schemas and TypeScript types for each request and response. Web and API both import them. |
| Database | `apps/api/src/db` | Drizzle schema, migrations, and the `pg` pool with `attachDatabasePool` |
| Auth | `apps/api/src/auth` | Better Auth instance and `@thallesp/nestjs-better-auth` module with a global guard |
| Crypto | `apps/api/src/crypto` | `KeyVault`: encrypt and decrypt provider keys |
| Network guard | `apps/api/src/net` | `safeFetch`: outbound HTTPS with private-address blocks |
| Providers | `apps/api/src/providers` | `MusicProvider` and `TextProvider` interfaces, `KieMusicProvider`, `SunoClassicMusicProvider`, `ElevenLabsMusicProvider`, `OpenAiCompatibleTextProvider`, and a registry |
| Connections | `apps/api/src/connections` | CRUD and "test connection" for provider keys |
| Assist | `apps/api/src/assist` | The lyric and prompt helper |
| Generations | `apps/api/src/generations` | Submit, webhook, sync, sync on read, and the daily sweep route |
| Storage | `apps/api/src/storage` | `AudioStore` interface and an R2 implementation (S3 API) |
| Library | `apps/api/src/tracks` | List, rename, delete, stream, and download tracks |
| Web app | `apps/web` | Pages, the global player, and the API client |

Each unit depends on interfaces, not on other units' internals. Tests replace `MusicProvider`,
`TextProvider`, and `AudioStore` with fakes.

### 3.2 Provider interfaces

Music APIs use one of two flows, so `MusicProvider` is a union of two shapes:

```ts
interface MusicProviderBase {
  readonly adapter: MusicAdapter;                  // 'kie' | 'suno_classic' | 'elevenlabs'
  readonly displayName: string;                    // "kie.ai", "Suno-compatible", "ElevenLabs Music"
  readonly defaultBaseUrl: string;
  readonly capabilities: MusicCapabilities;        // which form fields apply, limits, tracks per request
  readonly inputSchema: ZodType<GenerationInput>;  // this adapter's limits, from packages/shared
  checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck>;
  listModels(): ModelOption[];
}

// Job flow: submit, then a callback and/or a status poll (kie, suno_classic)
interface JobMusicProvider extends MusicProviderBase {
  readonly flow: 'job';
  readonly supportsCallback: boolean;
  submit(conn: DecryptedConnection, input: GenerationInput, callbackUrl?: string): Promise<{ taskId: string }>;
  getTask(conn: DecryptedConnection, taskId: string): Promise<MusicTaskResult>; // state + tracks with URLs
}

// Direct flow: one call returns the audio (elevenlabs)
interface DirectMusicProvider extends MusicProviderBase {
  readonly flow: 'direct';
  compose(conn: DecryptedConnection, input: GenerationInput, signal: AbortSignal): Promise<DirectTrack[]>;
}

type MusicProvider = JobMusicProvider | DirectMusicProvider;

interface DirectTrack { body: ReadableStream<Uint8Array>; contentType: string; durationSeconds?: number }

interface MusicCapabilities {
  lyrics: boolean; style: boolean; providerTitle: boolean; instrumental: boolean;
  lengthSeconds: { min: number; max: number } | null;   // null: the provider picks the length
  tracksPerRequest: number;
}

interface TextProvider {
  complete(conn: DecryptedConnection, request: AssistRequest): Promise<AssistResult>;
  checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck>;
  listModels(conn: DecryptedConnection): Promise<ModelOption[]>;
}
```

`GenerationInput` is one shared shape for all adapters: `idea`, `lyrics`, `style`, `title`, `instrumental`,
`model`, and `lengthSeconds`. Each adapter maps it to its own API, and its `inputSchema` applies its limits.
The Studio form shows only the fields in `capabilities`. A `title` is always stored in Minstrel, even when the
provider has no title field.

The registry maps `adapter` (`kie`, `suno_classic`, `elevenlabs`, `openai_compatible`) to an implementation.
To support a new provider, add one class and one registry entry.

- **Text:** one adapter, `openai_compatible`, covers all providers with that API. A new text provider needs
  no code.
- **Music:** each music API has its own request fields, job flow, and result shape. A new music provider
  needs one `MusicProvider` class, one `adapter` enum value, and tests with fixtures from its docs. The rest
  of the app (generations, tracks, storage, and UI) does not change.
- The UI lists the music adapters from the registry, so a new adapter appears in Settings without UI work.
- The webhook route is `/api/webhooks/:adapter/:generationId`. A job provider without callbacks
  (`supportsCallback = false`) uses only the sync on read and the daily sweep. A direct provider never uses the webhook.

### 3.3 Libraries

| Need | Library |
|---|---|
| ORM and migrations | `drizzle-orm`, `drizzle-kit`, `pg` |
| Auth | `better-auth`, `@thallesp/nestjs-better-auth`, Drizzle adapter |
| Validation | `zod` schemas in `packages/shared`, a Zod validation pipe in NestJS |
| Scheduled jobs | Vercel Cron, which calls `GET /api/cron/sweep` once per day |
| Work after the reply | `waitUntil` from `@vercel/functions` |
| Rate limits | `@nestjs/throttler` with a Postgres storage (§7.4), Vercel Firewall rate-limit rules |
| R2 | `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `@aws-sdk/s3-request-presigner` |
| Logs | `nestjs-pino` with key redaction |
| Web data | `@tanstack/react-query` |
| Email | `resend` |

## 4. Data model

PostgreSQL 18 with Drizzle. All IDs are UUID v7. All times are `timestamptz`.

### 4.1 Auth tables

Better Auth owns `user`, `session`, `account`, `verification`, and `rateLimit` (§7.4). Generate their
Drizzle schema with the Better Auth CLI. Do not edit them by hand.

### 4.2 `provider_connections`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | FK → `user.id` | Cascade delete |
| `kind` | enum `music`, `text` | |
| `adapter` | enum `kie`, `suno_classic`, `elevenlabs`, `openai_compatible` | `kind` must match the adapter |
| `label` | text | Unique per user |
| `base_url` | text | Adapter default. The user can change it. HTTPS only. |
| `key_ciphertext`, `key_iv`, `key_tag` | bytea | AES-256-GCM |
| `key_version` | smallint | Master key version |
| `key_last4` | text | For display only |
| `default_model` | text | |
| `status` | enum `unchecked`, `ok`, `invalid_key`, `unreachable` | |
| `last_checked_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz | |

### 4.3 `generations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | FK → `user.id` | Cascade delete |
| `connection_id` | FK → `provider_connections.id` | Set null on delete |
| `adapter` | enum | Copied from the connection at submit, so the row stays readable after a delete |
| `flow` | enum `job`, `direct` | |
| `provider_task_id` | text null | Job flow only. Unique with `connection_id`. |
| `callback_token_hash` | bytea null | Job flow with callbacks only. SHA-256 of the callback token. |
| `status` | enum | See §5.2 |
| `input` | jsonb | Validated `GenerationInput` |
| `error_code`, `error_message` | text null | |
| `next_poll_at` | timestamptz null | |
| `poll_attempts` | int | |
| `lease_until` | timestamptz null | Sync claim (§5.3). Stops two workers from syncing one row. |
| `created_at`, `updated_at` | timestamptz | |

Index: `(status, next_poll_at)` for the sync on read and the daily sweep. Index: `(user_id, created_at desc)` for the list.

### 4.4 `tracks`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `generation_id` | FK → `generations.id` | Cascade delete |
| `user_id` | FK → `user.id` | Cascade delete |
| `provider_track_id` | text | Unique with `generation_id` |
| `title`, `style`, `lyrics` | text | |
| `duration_seconds` | numeric null | |
| `audio_key`, `cover_key` | text null | `users/<userId>/tracks/<trackId>.mp3` and `.jpg` |
| `storage_status` | enum `pending`, `stored`, `copy_failed` | |
| `copy_attempts` | int | |
| `provider_audio_url`, `provider_cover_url` | text null | Set to null after the copy |
| `created_at`, `updated_at` | timestamptz | |

Index: `(user_id, created_at desc)`.

### 4.5 `rate_limits`

The `@nestjs/throttler` storage (§7.4). It has no user data, so it has no ownership rule.

| Column | Type | Notes |
|---|---|---|
| `key` | text PK | Throttler name, route, and user ID |
| `hits` | int | |
| `reset_at` | timestamptz | The daily sweep deletes rows where `reset_at < now()`. |

### 4.6 Ownership rule

Each query for a connection, generation, or track filters on `user_id` from the session. A row of another
user returns `404`, not `403`, so that IDs do not leak.

## 5. Song generation

### 5.1 Provider facts (from each provider's docs, 2026-10-16)

| Fact | `kie` (kie.ai) | `suno_classic` (sunoapi.org) | `elevenlabs` (ElevenLabs Music) |
|---|---|---|---|
| Flow | job | job | direct |
| Default base URL | `https://api.kie.ai` | `https://apibox.erweima.ai` | `https://api.elevenlabs.io` |
| Auth header | `Authorization: Bearer <key>` | `Authorization: Bearer <key>` | `xi-api-key: <key>` |
| Submit | `POST /api/v1/jobs/createTask`, snake_case fields (`custom_mode`, `callBackUrl`) | `POST /api/v1/generate`, camelCase fields (`customMode`, `callBackUrl`) | `POST /v1/music` with `prompt`, `model_id`, `music_length_ms`, `force_instrumental` |
| Status | `GET /api/v1/jobs/recordInfo?taskId=` | `GET /api/v1/generate/record-info?taskId=` | — (the response is the audio file) |
| States | `waiting`, `queuing`, `generating`, `success`, `fail` | `PENDING`, `TEXT_SUCCESS`, `FIRST_SUCCESS`, `SUCCESS`, `CREATE_TASK_FAILED`, `GENERATE_AUDIO_FAILED`, `SENSITIVE_WORD_ERROR` | — |
| Callback stages | `text`, `first`, `complete` | `text`, `first`, `complete` | none |
| Models | `V6`, `V6_MINI`, `V6_WILD` | `V6`, `V6_MINI`, `V6_WILD` | `music_v1`, `music_v2`, `music_v2_5` |
| Limits | title 80, style 1000, lyrics 5000, idea 3000, length 10–360 s | the same as `kie` | length 3–600 s |
| Tracks per request | 2 | 2 | 1 |
| Files kept by provider | 14 days | 14 days | not applicable (Minstrel stores the response) |
| Lyrics | own field | own field | inside `prompt`; with no lyrics, the model writes them |
| Instrumental | `instrumental: true` | `instrumental: true` | `force_instrumental: true` |

Other facts:

- Only paid ElevenLabs plans can use the Music API.
- ElevenLabs allows 3–600 s, but Minstrel limits ElevenLabs songs to 5–180 s, so that each call ends
  inside the 300 s function limit (§5.4). The test before launch measures a 180 s song (§11).
- The kie.ai webhook HMAC signs `taskId.timestamp` only, not the body. Both Suno providers tell clients to
  read the authoritative result from the status endpoint.
- Earlier Suno models (`V4` to `V5_5`) are discontinued. Minstrel does not offer them.

The ElevenLabs adapter builds `prompt` from the form in this order: the style, the idea, then
`Lyrics:` and the lyrics. When `instrumental` is true, it sets `force_instrumental` and sends no lyrics.

### 5.2 Generation states

```
job flow:     submitting ──► pending ──► text_ready ──► first_ready ──► complete
direct flow:  queued ──► running ──► complete
              any state that is not complete ──► failed
```

The sync step can skip states. For example, `pending` can go directly to `complete`.

### 5.3 Job flow (`kie`, `suno_classic`)

1. **Submit.** `POST /api/generations` with `connectionId` and `input`.
   1. The adapter's `inputSchema` checks the limits from §5.1.
   2. When `supportsCallback` is true, the API makes a 32-byte random callback token and stores its
      SHA-256 hash.
   3. The API inserts the generation with status `submitting`, `flow = job`, and the adapter.
   4. `KeyVault` decrypts the key. `submit()` sends the task with
      `callBackUrl = ${WEB_ORIGIN}/api/webhooks/<adapter>/<generationId>?t=<token>`.
   5. On success: the API saves `provider_task_id`, sets `pending`, and sets `next_poll_at = now + 60 s`.
   6. On failure: the API sets `failed` with a mapped error (§8).
   7. The response is the generation, with `202 Accepted`.
2. **Callback.** `POST /api/webhooks/:adapter/:generationId?t=<token>` is public (`@AllowAnonymous`).
   1. The API compares the token hash with `crypto.timingSafeEqual`. A mismatch, an unknown ID, or an
      adapter that does not match the row returns `404`.
   2. The API ignores the request body.
   3. The API replies `200` at once and passes `sync(generationId)` to `waitUntil`. The function instance
      stays alive until the sync ends.
3. **Sync.** `sync(generationId)` first claims the row with one statement:
   `UPDATE generations SET lease_until = now() + interval '90 seconds' WHERE id = $1 AND
   (lease_until IS NULL OR lease_until < now()) RETURNING *`. When no row returns, another worker has the
   claim, and this call stops. A callback, a read, and the daily sweep can never sync the same row at the same time.
   The provider call happens outside any database transaction, so a slow provider never holds a lock.
   1. When the connection no longer exists, the generation goes to `failed` with `connection_removed`.
   2. `getTask()` reads the status endpoint with the user's key.
   3. In one short transaction, the API saves the mapped state, upserts each returned track on
      `(generation_id, provider_track_id)`, and clears `lease_until`.
   4. Each new track starts the copy to R2 (§5.5).
4. **Sync on read.** Vercel Cron runs only once per day on Hobby (§2.1), so reads drive the fallback poll.
   A job generation is due when it is in `pending`, `text_ready`, or `first_ready` and
   `next_poll_at <= now()`.
   - `GET /api/generations/:id` passes `sync(generationId)` to `waitUntil` when the generation is due,
     then returns the row at once. The Studio page reads it every 3 seconds (§5.5).
   - `GET /api/generations` (the Library and the "Takes" panel) does the same for up to 5 of the user's
     due generations.
   - The lease in step 3 stops a double sync when two reads come at the same time.
   - Backoff: 60 s, 120 s, then 300 s.
   - After 30 minutes from submit, a read or the daily sweep sets `failed` with `provider_timeout`.
5. **Daily sweep.** Vercel Cron calls `GET /api/cron/sweep` once per day (§2.3). The route stops new work
   after 240 s, and the next sweep continues it. In this order, it:
   1. Syncs each due job generation, at most 5 at a time.
   2. Retries tracks in `pending` or `copy_failed` with fewer than 5 attempts.
   3. Does the work of §5.4 steps 3 and 4.
   4. Deletes old `rate_limits` rows (§4.5).

### 5.4 Direct flow (`elevenlabs`)

A direct call can take minutes, so the browser must not wait for it. The API runs the call with
`waitUntil` after the reply. On Hobby, a function stops after 300 s (§2.1). So Minstrel limits ElevenLabs
songs to 5–180 s, and the abort in step 2 stops the call after 240 s. The 60 s left over is for the
last R2 write and the database update.

1. **Submit.** `POST /api/generations` checks the input, inserts the generation with status `queued` and
   `flow = direct`, and returns `202 Accepted` at once. Then it passes `startDirect(generationId)` to
   `waitUntil`.
2. **Start and run.** `startDirect` claims the row in one short transaction:
   1. It takes `pg_advisory_xact_lock` on the user ID, so two starts for one user never count at the
      same time.
   2. It counts the user's direct generations in `running`. When the count is 4 or more, the row stays
      `queued`, and `startDirect` stops.
   3. Otherwise it sets `running` and a lease of 6 minutes, with the lease statement of §5.3. The lease is
      longer than the 300 s limit, so a live call never looks stopped.
   4. After the commit, `compose()` calls the provider with an `AbortSignal` that stops the call after
      240 s.
   5. The response body streams straight into R2 (§5.5). It never sits in memory as one buffer.
   6. On success: one transaction inserts the track with `storage_status = stored` and sets `complete`.
   7. On failure: the API sets `failed` with a mapped error (§8).
   8. At the end, success or failure, `startDirect` runs again for the user's oldest `queued` generation.
3. **No automatic retry.** Each direct call costs the user money. When a read or the daily sweep finds a
   `running` generation with an expired lease (for example, after Vercel stopped the instance), it sets
   `failed` with `interrupted`. It never calls the provider again. The user can press "Make song" again.
4. **Queue limit.** Each user has at most 4 direct calls in `running`. Step 2.8 starts the next `queued`
   generation. A read and the daily sweep also pass `startDirect` to `waitUntil` for `queued`
   generations, in creation order. A `queued` row costs nothing, so Minstrel can start it safely at any
   time.

### 5.5 Live status and copy to R2

**Live status.** The Studio page polls `GET /api/generations/:id` every 3 seconds while the status is not
`complete` or `failed`. A server-sent events stream keeps a function instance open and stops at
`maxDuration`, so v1 does not use them.

**Copy to R2 (job flow).**

1. `safeFetch` downloads the provider audio URL as a stream (§7.3).
2. `@aws-sdk/lib-storage` `Upload` streams it to `users/<userId>/tracks/<trackId>.<ext>`. The object keeps
   the provider's `Content-Type` when it starts with `audio/`. Any other type becomes `audio/mpeg`. The
   extension follows the type (`mp3`, `wav`, or `m4a`). The cover image goes to `.jpg` the same way, and its
   type must start with `image/`.
3. The size limit is 50 MB for audio and 5 MB for a cover. The copy stops when a file is larger.
4. On success: `storage_status = stored`, and the provider URLs become null.
5. On failure: `storage_status = copy_failed`, and `copy_attempts` goes up by one. The daily sweep retries.
6. Before the copy finishes, the player uses `provider_audio_url` (the provider's stream URL). The user can
   play the first take before the copy is done.

**Direct flow.** The provider response streams into R2 with the same type, extension, and size rules. A
direct track has no provider URL and no cover image. The UI shows a generated pattern in place of a cover.

## 6. Lyric and prompt helper

- `POST /api/assist` with `connectionId`, `task` (`lyrics`, `style`, or `title`), the idea, and the
  current form fields.
- `OpenAiCompatibleTextProvider` calls `POST <base_url>/chat/completions` with the user's key and model.
- The API asks for JSON with `response_format: { type: "json_schema" }`. Some models do not support it.
  For those models, the API asks for JSON in the prompt, then checks the reply with Zod.
- `max_tokens` is 1500. The timeout is 60 seconds.
- The result fills the form. The API stores nothing.
- The response is not streamed in v1. The UI shows a waiting state.

## 7. Security

### 7.1 Provider keys

- `KeyVault` uses AES-256-GCM with a 12-byte random IV for each encryption.
- The additional authenticated data (AAD) is `"<userId>:<connectionId>"`. A ciphertext that someone copies
  into another row fails to decrypt.
- `KEY_ENCRYPTION_KEYS` holds versioned master keys. New keys use the highest version. Decryption uses the
  version of the row. A rotation script re-encrypts old rows.
- The API decrypts a key only inside a provider call. It never returns the key. The UI shows `key_last4`.
- To change a key, the user replaces it. The UI never shows the old key.

### 7.2 Auth and sessions

- Better Auth runs inside NestJS. `baseURL` is `WEB_ORIGIN` and `basePath` is `/api/auth`, because the
  browser reaches auth on the same origin, through the `api` service. The Google OAuth redirect URI is therefore
  `https://minstrel.<name>.to/api/auth/callback/google`.
- Sign-in methods: email + password with email verification, and Google.
- Resend sends the verification and password reset emails.
- The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and host-only.
- The module guard protects every route. Only `/api/auth/*`, `/api/health`, `/api/webhooks/*`, and
  `/api/cron/sweep` skip the session check. The webhook route checks its token, and the sweep route checks
  `CRON_SECRET`.
- Account deletion uses Better Auth `deleteUser`. A hook first deletes all R2 objects under
  `users/<userId>/`. The database cascades remove the user's rows.
- The Next.js `proxy.ts` sends a signed-out user to `/sign-in` when no session cookie exists. This check
  is only for navigation. The API guard is the real check.

### 7.3 Outbound requests (SSRF)

Users control `base_url`, so they also control which audio URLs the API downloads. The API must never
reach a private or metadata address. All outbound calls use `safeFetch`:

- HTTPS only. Port 443 only.
- A custom DNS lookup blocks loopback, private (RFC 1918), link-local, CGNAT `100.64.0.0/10` (Tailscale),
  unique local IPv6, and metadata addresses. The check runs on the resolved IP at connect time, so DNS
  rebinding fails.
- Redirects: at most 3, and the guard checks each hop.
- Timeouts: 30 seconds to connect and to first byte for API calls. 5 minutes in total for a file download.

Result: v1 cannot use providers on a private network, for example a local Ollama server.

### 7.4 Other controls

- **CSRF:** Better Auth checks the origin for auth routes. A global guard rejects mutating requests to
  other routes when `Origin` is not `WEB_ORIGIN`. All bodies must be `application/json`.
- **Rate limits (per user):** 10 generations per minute, 20 assist calls per minute, 30 connection tests
  per hour. Many function instances run at the same time, so a count in memory is not correct.
  `@nestjs/throttler` uses a `ThrottlerStorage` on the Postgres table `rate_limits` (§4.5). Better Auth uses `rateLimit.storage = "database"` for auth routes.
- **Rate limits (per IP):** a Vercel Firewall rate-limit rule allows 120 requests per minute on
  `/api/webhooks/*`.
- **Client IP:** the API reads the client IP from the `x-real-ip` header that Vercel sets. A test before
  launch must confirm that Better Auth and the throttler see the real client IP.
- **Logs:** pino redacts `authorization`, `cookie`, `apiKey`, `key`, and `*.key*` paths. Provider error
  bodies go through the same redaction before the API logs them.
- **R2:** the bucket is private. Stream URLs are valid for 15 minutes. Download URLs set
  `Content-Disposition: attachment`.

## 8. Errors

The API returns `{ code, message }`. The UI shows `message` as it is.

| Source | Code | Message in the UI |
|---|---|---|
| Provider 401 | `invalid_key` | "<Provider> did not accept this key. Check the key in Settings → Connections." |
| Provider 402, or no credits | `insufficient_credits` | "Your <Provider> account has no credits left. Add credits with <Provider>, then try again." |
| ElevenLabs 401 or 403 on `/v1/music` for a key that passed the test | `plan_required` | "ElevenLabs Music needs a paid ElevenLabs plan." |
| Provider 429 | `provider_rate_limited` | "<Provider> is busy. Wait a minute, then try again." |
| Provider 400 or 422 | `provider_rejected` | "<Provider> did not accept this request: <provider reason>." |
| Provider 5xx or timeout | `provider_unavailable` | "<Provider> did not answer. Try again in a few minutes." |
| Task failed (`fail`, `CREATE_TASK_FAILED`, `GENERATE_AUDIO_FAILED`) | `generation_failed` | "<Provider> could not make this song: <provider reason>." |
| `SENSITIVE_WORD_ERROR` | `content_rejected` | "<Provider> did not accept some words in the lyrics or the style. Change them, then try again." |
| Poll limit reached | `provider_timeout` | "<Provider> did not finish this song in 30 minutes." |
| Direct call stopped with its instance | `interrupted` | "Minstrel stopped while <Provider> made this song. Minstrel did not send the request again, so you were not charged twice. Press Make song to try again." |
| Connection deleted during a generation | `connection_removed` | "You removed the key for this song before it finished. Add a key, then make the song again." |
| Zod failure | `invalid_input` | The field-level messages |
| Our rate limit | `rate_limited` | "You sent too many requests. Wait a minute, then try again." |

`<Provider>` is the connection label that the user chose, for example "kie.ai", "My sunoapi", or
"ElevenLabs". Unexpected errors return `500` with `internal_error`. The log keeps the details.

## 9. API surface

All routes start with `/api`. All routes need a session, except where the table says "public".
Request and response schemas live in `packages/shared`.

| Method and path | Job |
|---|---|
| `* /api/auth/*` | Better Auth (public) |
| `GET /api/health` | Health check (public) |
| `GET /api/connections` | List the user's connections (no keys) |
| `POST /api/connections` | Add a connection |
| `PATCH /api/connections/:id` | Change the label, base URL, default model, or key |
| `DELETE /api/connections/:id` | Delete a connection |
| `POST /api/connections/:id/test` | Check the key with the provider |
| `GET /api/connections/:id/models` | List models |
| `GET /api/providers` | List the adapters, their display names, default base URLs, and capabilities |
| `POST /api/assist` | Lyric and prompt helper |
| `POST /api/generations` | Submit a song request |
| `GET /api/generations` | List generations, cursor pages of 20 |
| `GET /api/generations/:id` | One generation and its tracks |
| `POST /api/webhooks/:adapter/:generationId` | Job-flow music provider callback (public, token). For example, `adapter = kie`. |
| `GET /api/cron/sweep` | Daily sweep (public, `CRON_SECRET` bearer token, §5.3) |
| `GET /api/tracks` | Library, cursor pages of 50, newest first |
| `PATCH /api/tracks/:id` | Rename |
| `DELETE /api/tracks/:id` | Delete the row and the R2 objects |
| `GET /api/tracks/:id/stream` | `302` to a signed R2 URL |
| `GET /api/tracks/:id/download` | `302` to a signed R2 URL for download |

## 10. Web app and visual design

### 10.1 Pages

| Route | Content |
|---|---|
| `/` | Signed out: what Minstrel does, in three steps. Signed in: redirect to `/studio`. |
| `/sign-in`, `/sign-up` | Email + password and Google |
| `/studio` | Song form, helper buttons, and the tracks of the current generation |
| `/library` | All songs, newest first |
| `/settings/connections` | Add, test, and remove provider keys |
| `/settings/account` | Email, password, and account deletion |

A first-time user with no music connection sees `/settings/connections` with one instruction:
"Add a music provider key to make songs." The page lists kie.ai, Suno-compatible, and ElevenLabs Music,
each with a link to the page where the user gets a key. This empty state replaces a separate onboarding flow.

The player bar is fixed at the bottom of every signed-in page. One `<audio>` element lives in a React
context, so playback continues across page changes. The Media Session API gives lock-screen controls.

### 10.2 Design direction: the chrome disc

Minstrel follows desktop.fm (measured from its live CSS on 2026-10-17). The interface is gray and nearly
black and white. One object carries the brand: a white CD that floats in a field of green laser lines.
The lasers are part of the scene, not a UI color.

**Color tokens**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#BEC2C4` scene gray | `#1B1C1D` | Page background |
| `--panel` | `#DDDDDD` pale stone | `#2D2D2D` | Cards and the player |
| `--ink` | `#111111` carbon | `#EEEEEE` | Text and the focus outline |
| `--muted` | `#4A4A4A` | `#A8A8A8` | Labels and hints |
| `--action` | `#2D2D2D` graphite | `#EEEEEE` | One primary action on each screen, the title pills, the selected nav item |
| `--soft` | `#B5ADAD` taupe | `#4A4646` | Second actions and play buttons |
| `--field` | white at 70% on the card | black at 25% | Inputs |
| `--laser` | `#3DFF8A` | `#3DFF8A` | The scene only (landing and sign-in pages). Never on a control. |
| `--selection` | `#0059FF` | `#0059FF` | Text selection only |

Errors use no color. An icon, bold text, and a 2 px ink edge show the error. WCAG 1.4.1 permits this,
because the meaning does not depend on color.

Measured WCAG contrast ratios:

| Pair | Ratio | Needed |
|---|---|---|
| Ink on light bg | 10.52 | 4.5 (text) |
| Ink on card | 13.90 | 4.5 (text) |
| Muted on card | 6.52 | 4.5 (text) |
| Muted on light bg | 4.94 | 4.5 (text) |
| White on graphite button | 13.77 | 4.5 (button text) |
| Ink on taupe button | 8.58 | 4.5 (button text) |
| Placeholder `#6F6F6F` on field | 4.61 | 4.5 (text) |
| Ink focus outline on card | 13.90 | 3.0 (focus) |
| Ink on dark bg | 14.71 | 4.5 (text) |
| Muted on dark card | 5.79 | 4.5 (text) |

**Rule:** two desktop.fm values fail WCAG, so Minstrel changes them. The label gray `#6F6F6F` is 3.70
on the card, so labels use `#4A4A4A`. The white focus outline is 1.36 on the card, so focus uses ink.

**Type**

One face: the system font stack (`-apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto`).
No web font loads.

| Role | Size | Weight | Tracking |
|---|---|---|---|
| Page titles, wordmark | 28 px | 800 | -1 px |
| Section titles | 18 px | 800 | -0.5 px |
| Body, inputs, buttons | 16 px | 700 | -0.25 px |
| Labels, pills, meta | 12 px | 800 | -0.5 px |
| Tag | 10 px | 700 | 0 |

No weight is below 500. Line height is 1.25. Lyrics use line height 1.5. Labels are sentence case,
never all caps. Use tabular figures for durations.

**Shape**

| Element | Radius |
|---|---|
| Cards | 25 px, shadow `0 0 40px rgba(51,51,51,.1)`, no border |
| Buttons and inputs | 20 px, 55 px tall for the main block buttons |
| Title pill and switch | 13 px, 26 px tall |

Each card has its title in a dark pill that floats 10 px above it. A primary button puts its label on
the left and a chevron on the right. A pressed button scales to 98%.

**Layout**

Studio, wide screen. The form is left-aligned. Text never centers, except in the empty states.

```
┌────────────────────────────────────────────────────────────────────┐
│ Minstrel     Studio   Library                        Settings      │
├───────────────────────────────────────┬────────────────────────────┤
│ Idea                                   │ Takes                      │
│ [ a sea shanty about a lost cat     ]  │ The Cat Who Sailed  2:41 ▶ │
│                                        │ The Cat Who Sailed  3:02 ▶ │
│ Lyrics             [Write lyrics]      │                            │
│ ┌────────────────────────────────────┐ │ Writing words ✓            │
│ │ [Verse]                            │ │ First take ready ✓         │
│ │ ...                                │ │ All takes ready …          │
│ └────────────────────────────────────┘ │                            │
│ Style [ shanty, accordion ] [Suggest]  │                            │
│ Title [                   ] [Suggest]  │                            │
│ Instrumental [ ] Model [V6 · kie.ai ▾] │                            │
│                          [ Make song ] │                            │
├───────────────────────────────────────┴────────────────────────────┤
│ ▶  The Cat Who Sailed    ━━━━━━━━━━━━━━━━──────────  1:12 / 2:41   │
└────────────────────────────────────────────────────────────────────┘
```

The form shows only the fields in the adapter's `capabilities`. For example, ElevenLabs shows a length
slider from 5 to 180 s in 5 s steps (default 150 s), and keeps the title in Minstrel only. When the user
picks a model of a different provider, the values in hidden fields stay in the form, so nothing typed is
lost.

The **Model** field is a searchable model picker. It follows the ARIA 1.2 combobox pattern, because a
provider such as OpenRouter can list hundreds of models, and a plain `<select>` has no search.

- The field shows the model and its connection, for example "V6 · kie.ai". A pick sets the model and the
  connection together, so the form has no separate Provider field.
- A click opens a panel. The cursor is in the "Search models" field, and typing filters by model name,
  connection label, or note.
- The **Recent** group shows the last 3 models that the user picked. Below it, the models are grouped by
  connection, from `GET /api/connections/:id/models`.
- The arrow keys move the highlight, Enter picks, and Escape or a click outside closes the panel. The focus
  stays in the search field, and `aria-activedescendant` names the highlighted model.
- A search with no match shows "No models match". The panel footer shows the model count and an "Add a key"
  link to Settings → Connections.

On a phone, the "Takes" column moves below the form, and the player bar stays at the bottom.

The library is a list, like the contents page of a songbook, not a grid of cards:

```
The Cat Who Sailed           shanty, accordion        2:41    16 Oct
Lantern Over Dunmoor         folk, harp, female       3:15    15 Oct
```

The title (16 px, weight 800) is the strongest element on each row. The other columns are quiet. The list
sits on one card.

**Principles**

1. Spend boldness in one place: the disc and its lasers. Everything else is gray and calm.
2. Each screen has one graphite primary button. Second actions are taupe or text.
3. The three generation stages are a real sequence, so the UI lists them in order with a check mark
   for each finished stage and a spinner for the current stage.
4. Motion: a new take grows into the "Takes" list, and a pressed button scales down. Respect
   `prefers-reduced-motion`.
5. Copy names user actions in plain words: "Make song", "Write lyrics", "Suggest", "Add key", "Test key".
   The success toast uses the same verb: "Key added".

**Disc asset.** The design files draw the disc with CSS as a stand-in. The final product needs a real
3D render (for example, from Blender or Spline), exported as a WebP or AVIF image with a PNG fallback.

**Earlier direction.** The first design used "the dye house": linen, woad, madder, weld, and a
blackletter face. The owner rejected it on 2026-10-17 because the screens looked dated.

### 10.3 Quality floor

- The layout works from 360 px wide.
- Keyboard focus is visible on each control (2 px `--ink` outline, 2 px offset).
- Each icon button has an accessible name.
- The player responds to the Space key and the arrow keys when it has focus.
- Error text sits next to its field and uses `aria-describedby`.

## 11. Testing

Test limits on the owner's laptop: one test file at a time, `--maxWorkers=1`,
`NODE_OPTIONS=--max-old-space-size=1024`.

| Level | What | Tool |
|---|---|---|
| Unit | `KeyVault`: round trip, wrong AAD fails, changed byte fails, old version decrypts | Vitest |
| Unit | `safeFetch`: each blocked range, DNS rebinding, redirect to a private IP | Vitest |
| Unit | Each music adapter (`kie`, `suno_classic`, `elevenlabs`): request body, auth header, state mapping, and error mapping, with fixtures from its docs | Vitest |
| Unit | ElevenLabs prompt builder: style, idea, and lyrics order; instrumental sends no lyrics | Vitest |
| Unit | Generation state transitions and backoff times | Vitest |
| Unit | Webhook token check: right token, wrong token, unknown ID | Vitest |
| Unit | Sweep route check: right `CRON_SECRET`, wrong token, no `Authorization` header | Vitest |
| Unit | ElevenLabs `inputSchema`: 5 s and 180 s pass, 4 s and 185 s fail | Vitest |
| Unit | Shared Zod schemas: each model limit | Vitest |
| Integration | Job flow: submit → callback → sync → tracks stored, with a fake `JobMusicProvider` and a fake `AudioStore`, on a real Postgres | Vitest + Docker Postgres |
| Integration | Direct flow: submit → run → stored; an expired `running` lease becomes `interrupted` and the fake provider gets no second call; the queue limit of 4 for each user, with two starts at the same time | Vitest + Docker Postgres |
| Integration | Rate limits: two Nest app instances on one Postgres share one count | Vitest + Docker Postgres |
| Integration | Sync on read: a read of a due generation starts one sync, and two reads at the same time start one sync | Vitest + Docker Postgres |
| Integration | Ownership: user B gets `404` for each route that takes user A's ID | Vitest + Supertest |
| Web | Form checks and the helper fill-in | Vitest + Testing Library |
| End to end | Sign up → add a fake connection → make a song → play it | Playwright, one test |
| Manual | One real song with each of the three adapters on the production setup before launch. For ElevenLabs, a 180 s song must finish in less than 240 s. | — |

## 12. Build order

Each milestone ends with working, tested code.

1. **Database and auth.** Drizzle, Postgres in Docker for development, Better Auth, the sign-in and
   sign-up pages, `vercel.json` with the two services, and `proxy.ts`.
2. **Connections.** `KeyVault`, `safeFetch`, the provider registry, the connection routes, and the
   Settings page.
3. **Helper.** `OpenAiCompatibleTextProvider`, `/api/assist`, and the Studio form with helper buttons.
4. **Job flow.** `KieMusicProvider`, submit, webhook, sync, sync on read, the daily sweep, and the
   "Takes" panel.
5. **Storage and library.** R2 copy, the library page, the player bar, rename, delete, and download.
6. **More adapters.** `SunoClassicMusicProvider` (job flow), then `ElevenLabsMusicProvider` with the direct
   flow runner (§5.4).
7. **Deployment.** The Vercel project on Pro, the checks in §2.3, the Neon integration and a restore test,
   the domain, the Firewall rule, and the pre-launch checks in §7.4 and §11.
