# Minstrel v1 — Design Spec

- **Date:** 2026-10-16
- **Status:** Draft for review
- **Repository:** `alienstro/minstrel` (pnpm + Turborepo: `apps/web`, `apps/api`, `packages/shared`)

## 1. Goal and scope

Minstrel is a hosted web app. A user signs in, adds their own AI provider keys, writes a song idea, and gets
songs that they can play and keep. Each user pays their own providers. The host pays only for hosting and
storage.

### 1.1 In scope for v1

1. **Generate songs** with a music provider. The first adapter is kie.ai (Suno models).
2. **Lyric and prompt helper.** A text model writes or improves lyrics, a style, and a title. The adapter is
   OpenAI-compatible, so it works with OpenRouter, OpenAI, Groq, kie.ai chat models, and other compatible APIs.
3. **Library and player.** The user plays, renames, downloads, and deletes their songs.
4. **Accounts.** Sign-in, provider keys, and account deletion.

### 1.2 Out of scope for v1

- Edit tools: extend, cover, vocal separation, WAV conversion, music video.
- Public song pages, sharing, likes, and comments.
- Payments, plans, and teams.
- Streamed lyric output (the helper returns the full result in one response).
- Music adapters other than kie.ai.
- Provider endpoints on a private network, for example a local Ollama server (see §7.3).

### 1.3 Success criteria

- A new user can sign up, add a kie.ai key, and play a generated song in less than 5 minutes.
- A song still plays 30 days after generation (kie.ai deletes its files after 14 days).
- No API path returns a stored provider key, and no log line contains one.
- A lost kie.ai callback does not leave a generation stuck. The fallback poll completes it or marks it
  failed within 30 minutes.

## 2. Infrastructure

### 2.1 Addresses

`<name>.to` is the owner's domain. Its DNS must be on Cloudflare.

| Address | Runs | Host |
|---|---|---|
| `minstrel.<name>.to` | Next.js web app | Vercel (Hobby plan) |
| `minstrel-api.<name>.to` | NestJS API | Self-hosted server `main`, through Cloudflare Tunnel |

The API uses a one-level subdomain. Cloudflare Universal SSL does not cover second-level names such as
`api.minstrel.<name>.to`.

**Note:** the Vercel Hobby plan allows non-commercial use only. Move to Vercel Pro before Minstrel takes
payments or shows ads.

### 2.2 Request paths

```
Browser ──► minstrel.<name>.to/*        Vercel: Next.js pages
Browser ──► minstrel.<name>.to/api/*    Vercel rewrite ──► minstrel-api.<name>.to/api/*
kie.ai  ──► minstrel-api.<name>.to/api/webhooks/kie/*
minstrel-api ──► Cloudflare ══ tunnel ══► cloudflared ──► Traefik (Dokploy) ──► api container ──► postgres
api container ──► kie.ai, OpenRouter, other providers, Cloudflare R2   (outbound)
Browser ──► R2 signed URL                 audio stream and download
```

- The browser uses one origin only. Next.js `rewrites()` sends `/api/*` to the API. CORS is not necessary.
- The session cookie is host-only on `minstrel.<name>.to`. Other subdomains of `<name>.to` never get it.
- Audio does not go through Vercel. The browser gets it from R2 with signed URLs.

### 2.3 Server `main`

Facts from the read-only check on 2026-10-16: Ubuntu 24.04, 4 CPUs, 12 GB RAM, 158 GB free disk.
Dokploy v0.30.6 runs with Traefik on ports 80/443 in Docker Swarm. The internet cannot reach the server
directly (NAT). The owner reaches it through Tailscale.

Minstrel adds these Dokploy services:

| Service | Description |
|---|---|
| `minstrel-api` | Dokploy application. Builds `apps/api/Dockerfile` from GitHub on each push to `main`. |
| `minstrel-db` | Dokploy database service, Postgres 18. Internal network only. Never publish port 5432. |
| `minstrel-tunnel` | `cloudflared` with one public hostname: `minstrel-api.<name>.to` → Traefik. |

Rules:

- Do not use `dokploy-postgres` for app data. It belongs to Dokploy.
- Do not route Dokploy (port 3000), SillyTavern, 9router, or Docker Swarm ports through the tunnel.
- Dokploy scheduled backups send a nightly `pg_dump` of `minstrel-db` to the R2 bucket `minstrel-backups`.
  The bucket keeps 14 daily copies. Do one restore test before launch.

### 2.4 Environment variables (API)

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Connection string for `minstrel-db` |
| `WEB_ORIGIN` | `https://minstrel.<name>.to`. Better Auth `baseURL` and trusted origin. |
| `PUBLIC_API_URL` | `https://minstrel-api.<name>.to`. Base of the kie.ai callback URLs. |
| `BETTER_AUTH_SECRET` | Better Auth signing secret, 32+ random bytes |
| `KEY_ENCRYPTION_KEYS` | Master keys for provider keys, for example `1:<base64 32 bytes>`. The highest version encrypts. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email for verification and password reset |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Audio storage |

The web app needs only `API_ORIGIN` (`https://minstrel-api.<name>.to`) for the rewrite.

## 3. Architecture

### 3.1 Units

| Unit | Location | Job |
|---|---|---|
| Shared contracts | `packages/shared` | Zod schemas and TypeScript types for each request and response. Web and API both import them. |
| Database | `apps/api/src/db` | Drizzle schema, migrations, and the `pg` pool |
| Auth | `apps/api/src/auth` | Better Auth instance and `@thallesp/nestjs-better-auth` module with a global guard |
| Crypto | `apps/api/src/crypto` | `KeyVault`: encrypt and decrypt provider keys |
| Network guard | `apps/api/src/net` | `safeFetch`: outbound HTTPS with private-address blocks |
| Providers | `apps/api/src/providers` | `MusicProvider` and `TextProvider` interfaces, `KieMusicProvider`, `OpenAiCompatibleTextProvider`, and a registry |
| Connections | `apps/api/src/connections` | CRUD and "test connection" for provider keys |
| Assist | `apps/api/src/assist` | The lyric and prompt helper |
| Generations | `apps/api/src/generations` | Submit, webhook, sync, and the fallback poller |
| Storage | `apps/api/src/storage` | `AudioStore` interface and an R2 implementation (S3 API) |
| Library | `apps/api/src/tracks` | List, rename, delete, stream, and download tracks |
| Web app | `apps/web` | Pages, the global player, and the API client |

Each unit depends on interfaces, not on other units' internals. Tests replace `MusicProvider`,
`TextProvider`, and `AudioStore` with fakes.

### 3.2 Provider interfaces

```ts
interface MusicProvider {
  submit(conn: DecryptedConnection, input: GenerationInput, callbackUrl: string): Promise<{ taskId: string }>;
  getTask(conn: DecryptedConnection, taskId: string): Promise<MusicTaskResult>; // state + tracks
  checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck>;        // for example, credits
  listModels(): ModelOption[];
}

interface TextProvider {
  complete(conn: DecryptedConnection, request: AssistRequest): Promise<AssistResult>;
  checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck>;
  listModels(conn: DecryptedConnection): Promise<ModelOption[]>;
}
```

The registry maps `adapter` (`kie`, `openai_compatible`) to an implementation. To support a new provider,
add one class and one registry entry.

### 3.3 Libraries

| Need | Library |
|---|---|
| ORM and migrations | `drizzle-orm`, `drizzle-kit`, `pg` |
| Auth | `better-auth`, `@thallesp/nestjs-better-auth`, Drizzle adapter |
| Validation | `zod` schemas in `packages/shared`, a Zod validation pipe in NestJS |
| Scheduled jobs | `@nestjs/schedule` |
| Rate limits | `@nestjs/throttler` |
| R2 | `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `@aws-sdk/s3-request-presigner` |
| Logs | `nestjs-pino` with key redaction |
| Web data | `@tanstack/react-query` |
| Email | `resend` |

## 4. Data model

PostgreSQL 18 with Drizzle. All IDs are UUID v7. All times are `timestamptz`.

### 4.1 Auth tables

Better Auth owns `user`, `session`, `account`, and `verification`. Generate their Drizzle schema with the
Better Auth CLI. Do not edit them by hand.

### 4.2 `provider_connections`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | FK → `user.id` | Cascade delete |
| `kind` | enum `music`, `text` | |
| `adapter` | enum `kie`, `openai_compatible` | |
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
| `provider_task_id` | text null | Unique with `connection_id` |
| `callback_token_hash` | bytea | SHA-256 of the callback token |
| `status` | enum | See §5.2 |
| `input` | jsonb | Validated `GenerationInput` |
| `error_code`, `error_message` | text null | |
| `next_poll_at` | timestamptz null | |
| `poll_attempts` | int | |
| `lease_until` | timestamptz null | Sync claim (§5.3). Stops two workers from syncing one row. |
| `created_at`, `updated_at` | timestamptz | |

Index: `(status, next_poll_at)` for the poller. Index: `(user_id, created_at desc)` for the list.

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

### 4.5 Ownership rule

Each query for a connection, generation, or track filters on `user_id` from the session. A row of another
user returns `404`, not `403`, so that IDs do not leak.

## 5. Song generation

### 5.1 kie.ai facts (from docs.kie.ai, 2026-10-16)

- Submit: `POST https://api.kie.ai/api/v1/jobs/createTask`, header `Authorization: Bearer <key>`.
- Status: `GET /api/v1/jobs/recordInfo?taskId=...`. States: `waiting`, `queuing`, `generating`, `success`,
  `fail`.
- Callbacks go to `callBackUrl` in three stages: `text`, `first`, `complete`.
- Models: `V6`, `V6_MINI`, `V6_WILD`. Earlier models are discontinued.
- Limits: `title` 80 characters. `style` 1000. `lyrics` 5000. `prompt` 3000 in non-custom mode.
- Files stay on kie.ai for 14 days.
- The webhook HMAC signs `taskId.timestamp` only, not the body. kie.ai tells clients to read the
  authoritative result from `recordInfo`.

### 5.2 Generation states

```
submitting ──► pending ──► text_ready ──► first_ready ──► complete
     │            │             │               │
     └────────────┴─────────────┴───────────────┴──► failed
```

The sync step can skip states. For example, `pending` can go directly to `complete`.

### 5.3 Flow

1. **Submit.** `POST /api/generations` with `connectionId` and `input`.
   1. The Zod schema checks the model limits from §5.1.
   2. The API makes a 32-byte random callback token and stores its SHA-256 hash.
   3. The API inserts the generation with status `submitting`.
   4. `KeyVault` decrypts the key. `KieMusicProvider.submit()` sends the task with
      `callBackUrl = ${PUBLIC_API_URL}/api/webhooks/kie/<generationId>?t=<token>`.
   5. On success: the API saves `provider_task_id`, sets `pending`, and sets `next_poll_at = now + 30 s`.
   6. On failure: the API sets `failed` with a mapped error (§8).
   7. The response is the generation, with `202 Accepted`.
2. **Callback.** `POST /api/webhooks/kie/:generationId?t=<token>` is public (`@AllowAnonymous`).
   1. The API compares the token hash with `crypto.timingSafeEqual`. A mismatch or an unknown ID returns
      `404`.
   2. The API ignores the request body.
   3. The API replies `200` at once, then runs `sync(generationId)` in the background.
3. **Sync.** `sync(generationId)` first claims the row with one statement:
   `UPDATE generations SET lease_until = now() + interval '90 seconds' WHERE id = $1 AND
   (lease_until IS NULL OR lease_until < now()) RETURNING *`. When no row returns, another worker has the
   claim, and this call stops. A callback and the poller can never sync the same row at the same time.
   The provider call happens outside any database transaction, so a slow provider never holds a lock.
   1. When the connection no longer exists, the generation goes to `failed` with `connection_removed`.
   2. `getTask()` reads `recordInfo` with the user's key.
   3. In one short transaction, the API saves the mapped state, upserts each returned track on
      `(generation_id, provider_track_id)`, and clears `lease_until`.
   4. Each new track starts the copy to R2 (§5.4).
4. **Fallback poller.** `@nestjs/schedule` runs every 30 seconds. It selects up to 20 generations in
   `pending`, `text_ready`, or `first_ready` where `next_poll_at <= now()`, and syncs each one.
   - Backoff: 30 s, 60 s, 120 s, then 300 s.
   - After 30 minutes from submit, the generation goes to `failed` with `provider_timeout`.
   - The same job retries tracks in `pending` or `copy_failed` with fewer than 5 attempts.
5. **Live status in the browser.** The Studio page polls `GET /api/generations/:id` every 3 seconds while
   the status is not `complete` or `failed`. Polling works through the Vercel rewrite. Server-sent events
   may get buffered there, so v1 does not use them.

### 5.4 Copy to R2

1. `safeFetch` downloads the provider audio URL as a stream (§7.3).
2. `@aws-sdk/lib-storage` `Upload` streams it to `users/<userId>/tracks/<trackId>.mp3`. The object keeps
   the provider's `Content-Type` when it starts with `audio/`. Any other type becomes `audio/mpeg`. The
   cover image goes to `.jpg` the same way, and its type must start with `image/`.
3. The size limit is 50 MB for audio and 5 MB for a cover. The copy stops when a file is larger.
4. On success: `storage_status = stored`, and the provider URLs become null.
5. On failure: `storage_status = copy_failed`, and `copy_attempts` goes up by one. The poller retries.
6. Before the copy finishes, the player uses `provider_audio_url` (kie.ai `stream_audio_url`). The user can
   play the first take before the copy is done.

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
  browser reaches auth through the Vercel rewrite. The Google OAuth redirect URI is therefore
  `https://minstrel.<name>.to/api/auth/callback/google`.
- Sign-in methods: email + password with email verification, and Google.
- Resend sends the verification and password reset emails.
- The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and host-only.
- The module guard protects every route. Only `/api/auth/*`, `/api/health`, and `/api/webhooks/kie/*` are
  public.
- Account deletion uses Better Auth `deleteUser`. A hook first deletes all R2 objects under
  `users/<userId>/`. The database cascades remove the user's rows.
- The Next.js `proxy.ts` sends a signed-out user to `/sign-in` when no session cookie exists. This check
  is only for navigation. The API guard is the real check.

### 7.3 Outbound requests (SSRF)

Users control `base_url`, so they also control which audio URLs the API downloads. The API runs next to
Dokploy and other private services. All outbound calls use `safeFetch`:

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
  per hour. Better Auth applies its own limits to auth routes.
- **Rate limits (per IP):** 120 requests per minute on the webhook route.
- **Client IP:** the API trusts forwarded headers from Traefik. A test before launch must confirm that the
  real client IP arrives through the chain Vercel → Cloudflare → Traefik. Until then, auth rate limits
  can count Vercel addresses.
- **Logs:** pino redacts `authorization`, `cookie`, `apiKey`, `key`, and `*.key*` paths. Provider error
  bodies go through the same redaction before the API logs them.
- **R2:** the bucket is private. Stream URLs are valid for 15 minutes. Download URLs set
  `Content-Disposition: attachment`.

## 8. Errors

The API returns `{ code, message }`. The UI shows `message` as it is.

| Source | Code | Message in the UI |
|---|---|---|
| Provider 401 | `invalid_key` | "kie.ai did not accept this key. Check the key in Settings → Connections." |
| Provider 402 or no credits | `insufficient_credits` | "Your kie.ai account has no credits left. Add credits on kie.ai, then try again." |
| Provider 429 | `provider_rate_limited` | "kie.ai is busy. Wait a minute, then try again." |
| Provider 400 or 422 | `provider_rejected` | "kie.ai did not accept this request: <provider reason>." |
| Provider 5xx or timeout | `provider_unavailable` | "kie.ai did not answer. Try again in a few minutes." |
| Task state `fail` | `generation_failed` | "kie.ai could not make this song: <provider reason>." |
| Poll limit reached | `provider_timeout` | "kie.ai did not finish this song in 30 minutes." |
| Connection deleted during a generation | `connection_removed` | "You removed the key for this song before it finished. Add a key, then make the song again." |
| Zod failure | `invalid_input` | The field-level messages |
| Our rate limit | `rate_limited` | "You sent too many requests. Wait a minute, then try again." |

The UI uses the provider label (for example, "kie.ai" or "OpenRouter") from the connection, not a fixed
name. Unexpected errors return `500` with `internal_error`. The log keeps the details.

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
| `POST /api/assist` | Lyric and prompt helper |
| `POST /api/generations` | Submit a song request |
| `GET /api/generations` | List generations, cursor pages of 20 |
| `GET /api/generations/:id` | One generation and its tracks |
| `POST /api/webhooks/kie/:generationId` | kie.ai callback (public, token) |
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
"Add a kie.ai key to make songs." This empty state replaces a separate onboarding flow.

The player bar is fixed at the bottom of every signed-in page. One `<audio>` element lives in a React
context, so playback continues across page changes. The Media Session API gives lock-screen controls.

### 10.2 Design direction: the dye house

Medieval minstrels wore cloth dyed with three plants: **woad** (blue), **madder** (red), and **weld**
(yellow). Minstrel takes its palette from those dyes on undyed cool linen, and its ink from oak gall. The
look avoids parchment, gold leaf, and wood textures, which are the usual "medieval" defaults.

**Color tokens**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#E4E8EE` linen | `#17213A` deep woad | Page background |
| `--ink` | `#2A2420` oak gall | `#E4E8EE` linen | Text |
| `--structure` | `#24406F` woad | `#7FA3D9` light woad | The selected navigation item, links, focus outline |
| `--action` | `#9C2A3C` madder | `#E0727F` light madder | One primary action on each screen, for example "Make song" |
| `--on-action` | `#FFFFFF` | `#17213A` | Text on the primary action |
| `--weld` | `#D8B22E` | `#D8B22E` | Playback only: the progress bar and the "now playing" mark |
| `--player` | `#24406F` woad | `#24406F` woad | Player bar background, in both modes |
| `--edge` | `#6E7F9C` | `#6A7B9B` | Input and button borders |
| `--wash` | `#C9D3E3` | `#22304F` | Dividers and hover backgrounds (decoration only) |

Measured WCAG contrast ratios:

| Pair | Ratio | Needed |
|---|---|---|
| Ink on light bg | 12.45 | 4.5 (text) |
| Ink on dark bg | 12.98 | 4.5 (text) |
| Woad on light bg | 8.38 | 4.5 (link text) |
| Light woad on dark bg | 6.19 | 4.5 (link text) |
| White on madder | 7.47 | 4.5 (button text) |
| Deep woad on light madder | 5.23 | 4.5 (button text) |
| Madder on light bg | 6.08 | 3.0 (button edge) |
| Light madder on dark bg | 5.23 | 3.0 (button edge) |
| Linen on player bar | 8.38 | 4.5 (text) |
| Weld on player bar | 5.07 | 3.0 (progress bar) |
| Edge on light bg | 3.30 | 3.0 (control edge) |
| Edge on dark bg | 3.74 | 3.0 (control edge) |

**Rule:** weld appears only on the player bar or on the dark background. On the light background, weld
has a ratio of 1.65, so the "now playing" row in the light library uses a woad mark. `--wash` is too light
for a control edge (1.23 on linen), so it is decoration only.

**Type**

| Role | Face | Notes |
|---|---|---|
| Song titles and page titles | Grenze Gotisch (Google Fonts) | A readable blackletter. Use it only at 24 px or more, never for body text or buttons. |
| Everything else | Alegreya Sans (Google Fonts) | A humanist sans with calligraphic roots. Use tabular figures for durations. |

Type scale: 16 px base, ratio 1.25 (16, 20, 25, 31, 39). Body line height 1.5. Lyrics use a 65-character
measure and line height 1.6. Labels are sentence case, never all caps.

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
│ Model [V6 ▾]  Instrumental [ ]         │                            │
│                          [ Make song ] │                            │
├───────────────────────────────────────┴────────────────────────────┤
│ ▶  The Cat Who Sailed    ━━━━━━━━━━━━━━━━──────────  1:12 / 2:41   │
└────────────────────────────────────────────────────────────────────┘
```

On a phone, the "Takes" column moves below the form, and the player bar stays at the bottom.

The library is a list, like the contents page of a songbook, not a grid of cards:

```
The Cat Who Sailed           shanty, accordion        2:41    16 Oct
Lantern Over Dunmoor         folk, harp, female       3:15    15 Oct
```

The title (Grenze Gotisch) is the strongest element on each row. The other columns are quiet.

**Principles**

1. Spend boldness in one place: blackletter song titles. Everything else is calm and plain.
2. Each color has one job. Woad is structure, madder is the one action, and weld is "playing now".
3. The three generation stages are a real sequence, so the UI lists them in order with a check mark
   for each finished stage.
4. Motion: one moment only. When a take is ready, its row grows into the "Takes" list. Respect
   `prefers-reduced-motion`.
5. Copy names user actions in plain words: "Make song", "Write lyrics", "Suggest", "Add key", "Test key".
   The success toast uses the same verb: "Key added".

**Review against generic defaults.** The first plan had a parchment background with a serif display and
a gold accent. That plan matched the cream-and-serif default, so it changed to cool linen with dye
colors. A dark-only theme with one bright accent was also rejected, because it is the other common
default. A card grid for the library was rejected, because songs are a list that people scan.

### 10.3 Quality floor

- The layout works from 360 px wide.
- Keyboard focus is visible on each control (2 px `--structure` outline, 2 px offset).
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
| Unit | kie.ai adapter: request body and state mapping, with fixtures from the docs | Vitest |
| Unit | Generation state transitions and backoff times | Vitest |
| Unit | Webhook token check: right token, wrong token, unknown ID | Vitest |
| Unit | Shared Zod schemas: each model limit | Vitest |
| Integration | Submit → callback → sync → tracks stored, with a fake `MusicProvider` and a fake `AudioStore`, on a real Postgres | Vitest + Docker Postgres |
| Integration | Ownership: user B gets `404` for each route that takes user A's ID | Vitest + Supertest |
| Web | Form checks and the helper fill-in | Vitest + Testing Library |
| End to end | Sign up → add a fake connection → make a song → play it | Playwright, one test |
| Manual | One real kie.ai song on the production setup before launch | — |

## 12. Build order

Each milestone ends with working, tested code.

1. **Database and auth.** Drizzle, Postgres in Docker for development, Better Auth, the sign-in and
   sign-up pages, the rewrite, and `proxy.ts`.
2. **Connections.** `KeyVault`, `safeFetch`, the provider registry, the connection routes, and the
   Settings page.
3. **Helper.** `OpenAiCompatibleTextProvider`, `/api/assist`, and the Studio form with helper buttons.
4. **Generation.** `KieMusicProvider`, submit, webhook, sync, the poller, and the "Takes" panel.
5. **Storage and library.** R2 copy, the library page, the player bar, rename, delete, and download.
6. **Deployment.** API Dockerfile, Dokploy services, Cloudflare Tunnel, backups, Vercel project, and the
   pre-launch checks in §7.4 and §11.
