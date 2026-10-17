# kie.ai Only, and kie.ai Lyrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship kie.ai as the only music provider, and let Write lyrics use kie.ai when the user has no OpenAI-compatible key.

**Architecture:** Part A deletes the Suno-compatible and ElevenLabs adapters, and the `direct` generation flow that only ElevenLabs used. A Drizzle migration removes the two `adapter` enum values and the `flow` column. Part B adds a kie.ai Generate Lyrics call (`ai-music-api/generate-lyrics`, the same `createTask` and `recordInfo` endpoints as music) behind `/api/assist` for the `lyrics` task.

**Tech Stack:** NestJS 12 (ESM), Drizzle ORM and drizzle-kit, Postgres 18 (Neon), Next.js 16, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-10-16-minstrel-v1-design.md` (§3.2 providers, §5 generation flows, §6 assist). The owner's decisions on 2026-10-17 override it: delete Suno-compatible, ElevenLabs and the direct flow, and migrate the enum.

## Global Constraints

- Branch: `feat/studio-models-and-length`. Do not push until the owner asks.
- Tests: one file at a time, `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=1024`. Typecheck and build: `--max-old-space-size=2048`.
- kie.ai lyrics prompt: at most 200 characters (kie.ai docs).
- The migration runs on the shared Preview and Production database on the next Vercel build (`scripts/migrate-on-vercel.mjs`).
- Text in code comments, commits and UI: ASD-STE100 Simplified Technical English.

## Review Focus

1. Production has kie.ai rows with `flow = 'job'`. The migration must keep them. If a row still uses `suno_classic` or `elevenlabs`, the migration must stop with an error, not change the row. → Task 4 test.
2. A song that is in progress during the deploy must keep its sync after the `flow` column goes. → Task 3 test.
3. An idea longer than 200 characters must go to kie.ai cut to 200 characters, not fail with a kie.ai error. → Task 6 test.
4. A kie.ai lyrics task that fails, or does not end in time, must give the form an error message. The request must not run past the function limit. → Task 6 tests.
5. A finished lyrics task with no `complete` version must give an error, not empty lyrics. → Task 6 test.

---

## Part A: kie.ai only

### Task 1: Shared types

**Files:** `packages/shared/src/adapters.ts`, `packages/shared/src/api.ts`, `packages/shared/src/generation-input.ts`, and their `.spec.ts` files.

- [ ] Remove `suno_classic` and `elevenlabs` from `MUSIC_ADAPTERS`, `ADAPTER_KIND`, `adapterSchema` and `LENGTH_LIMITS`. `MusicAdapter` becomes `'kie'`.
- [ ] Remove `flow` from `GenerationDto`.
- [ ] Update the specs. Delete the Suno and ElevenLabs cases. Keep `kie accepts length 10 and 360 and rejects 9 and 361`.
- [ ] Add the test `the adapter schema rejects suno_classic and elevenlabs`.
- [ ] Check: `pnpm --filter @minstrel/shared exec vitest run --maxWorkers=1 && pnpm --filter @minstrel/shared run build`.
- [ ] Commit.

### Task 2: API providers

**Files:** delete `apps/api/src/providers/elevenlabs.music.ts`, `suno-classic.music.ts` and their specs. Modify `registry.ts`, `types.ts`, `provider-error.ts`, `fake.music.spec.ts`.

- [ ] `musicProvidersFromEnv` returns only kie.ai (or the fake in fake mode).
- [ ] `types.ts`: remove `DirectMusicProvider` and the `flow` member. `MusicProvider` is the job provider.
- [ ] Check: `cd apps/api && npx vitest run src/providers --maxWorkers=1`.
- [ ] Commit.

### Task 3: API generations without the direct flow

**Files:** delete `apps/api/src/generations/direct-runner.ts`, `test/direct.e2e-spec.ts` and `test/direct-wiring.e2e-spec.ts`. Modify `generations.module.ts`, `generations.service.ts`, `generations.repo.ts`, `sweep.service.ts`, `sync.service.ts`, `test/support/fake-providers.ts`, `test/lease.e2e-spec.ts`, `test/sync.e2e-spec.ts`, and `apps/web/src/components/studio/takes-panel.tsx` (remove `DIRECT_STAGES`).

- [ ] Remove each `flow === 'direct'` branch and each `eq(generations.flow, …)` filter. Keep `leaseUntil`, because the job sync uses it.
- [ ] Add the test `sync.e2e: a job song created before the deploy keeps its sync` (Review Focus 2).
- [ ] Check each changed e2e file, one at a time: `cd apps/api && npx vitest run test/<file> --maxWorkers=1`.
- [ ] Commit.

### Task 4: Database migration

**Files:** `apps/api/src/db/schema.ts`, a new `apps/api/drizzle/0002_*.sql` and its meta snapshot.

- [ ] Schema: `adapter` enum is `['kie', 'openai_compatible']`. Remove `generationFlow` and the `flow` column.
- [ ] Run `npx drizzle-kit generate`, then check the SQL by hand. It must rename the old type, create the new type, convert `provider_connections.adapter` and `generations.adapter` with `USING adapter::text::adapter`, drop the old type, drop `generations.flow`, and drop `generation_flow`. A row with an old value makes the cast fail, so the migration stops (Review Focus 1).
- [ ] Test on a scratch database (`createdb minstrel_mig`): apply 0000 and 0001, insert one kie.ai row and one `elevenlabs` row, apply 0002, and expect an error. Delete the `elevenlabs` row, apply again, and expect success with the kie.ai row unchanged. Drop the scratch database.
- [ ] Apply the migration to the local `minstrel` database.
- [ ] Check: `cd apps/api && npx vitest run test/connections.e2e-spec.ts --maxWorkers=1`.
- [ ] Commit.

### Task 5: Web and docs

**Files:** `apps/web/src/app/page.tsx`, `apps/web/src/components/brand/sticker-columns.tsx`, the web tests that name the two providers (`connection-list.test.tsx`, `model-picker.test.tsx`, `song-form.test.tsx`), and `docs/deploy.md`.

- [ ] Remove the Suno-compatible and ElevenLabs text and stickers. The Add a key list comes from `GET /api/providers`, so it changes with Task 2.
- [ ] Song form tests: replace the ElevenLabs length test with a kie.ai one.
- [ ] Check: `cd apps/web && pnpm run typecheck`, then the three test files one at a time.
- [ ] Commit.

## Part B: kie.ai lyrics without a text key

### Task 6: API kie.ai lyrics

**Files:** `apps/api/src/providers/kie.music.ts` (+ spec), `apps/api/src/assist/assist.service.ts`, `apps/api/test/assist.e2e-spec.ts`.

**Produces:** `KieMusicProvider.writeLyrics(conn: DecryptedConnection, prompt: string): Promise<string>`.

- [ ] Tests in `kie.music.spec.ts`:
  - `writeLyrics creates an ai-music-api/generate-lyrics task and returns the first complete version`
  - `writeLyrics cuts the prompt to 200 characters` (Review Focus 3)
  - `writeLyrics fails when no version is complete` (Review Focus 5)
  - `writeLyrics stops after the time limit` (Review Focus 4)
- [ ] Implement it: `POST /api/v1/jobs/createTask` with `{ model: 'ai-music-api/generate-lyrics', input: { prompt } }`. Then poll `GET /api/v1/jobs/recordInfo?taskId=` every 2 s for up to 60 s. Read `lyricsData[]` from `response` or `resultJson.resultObject`, the same way `tracksOf` reads tracks.
- [ ] `AssistService`: a kie.ai connection with `task: 'lyrics'` calls `writeLyrics(conn, idea)`. A kie.ai connection with `style` or `title` returns 400 "Suggest needs a text provider key, for example OpenRouter."
- [ ] Tests in `assist.e2e-spec.ts`: `lyrics with a kie connection returns the kie lyrics` and `style with a kie connection returns 400`.
- [ ] Check: both files, one at a time.
- [ ] Commit.

### Task 7: Web Write lyrics with kie.ai

**Files:** `apps/web/src/components/studio/song-form.tsx` (+ test).

- [ ] With a text key: no change. Write lyrics and Suggest use the Helper model.
- [ ] Without a text key: Write lyrics sends `{ connectionId: <the chosen kie.ai connection>, task: 'lyrics', idea, fields }` with no model. Suggest stays disabled. The hint is "Write lyrics uses kie.ai. Add a text key in Settings to use Suggest."
- [ ] Tests: `without a text key, Write lyrics uses the kie connection` and `without a text key, Suggest is disabled`.
- [ ] Check: `cd apps/web && npx vitest run src/components/studio/song-form.test.tsx --maxWorkers=1`, then `pnpm run typecheck`.
- [ ] Commit.
- [ ] Run `/do-screenshots` for the Studio form without a text key, and for the Add a key provider list.

## Part C: Visible progress

### Task 8: Takes panel progress

**Files:** `apps/web/src/components/studio/takes-panel.tsx` (+ test), `apps/web/src/app/globals.css`, and the `.seek:disabled` style at `globals.css:351`.

- [ ] Above the steps, add a progress bar with `role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=3` and `aria-valuenow` equal to the number of done steps. Show a moving stripe while the song runs.
- [ ] Add a status line: "Making your song · m:ss" while the song runs, "Song ready" at the end, and the error text on a failure. The time counts from `createdAt`.
- [ ] Steps: a done step shows a check mark in a dark circle. The current step shows a turning ring. A step not started yet shows an empty ring. Use larger text (13 px).
- [ ] Under `prefers-reduced-motion`, show no stripe motion and no turning ring.
- [ ] Add a gray `:disabled` style for the `.seek` track and thumb. This fixes the Length slider that looks active when it is off.
- [ ] Tests: `the progress bar shows 1 of 3 when the words are ready`, `the status line shows the time since the song started`, `a finished song shows Song ready and 3 of 3`.
- [ ] Check: `cd apps/web && npx vitest run src/components/studio/takes-panel.test.tsx --maxWorkers=1`.
- [ ] Commit.
- [ ] Include this panel in the `/do-screenshots` run of Task 7.

## Final gate

- [ ] `pnpm run verify` or, without that script, typecheck, lint, test and build for each package, one at a time with Turbo `--concurrency=1`.
- [ ] One review of the whole branch with `/code-review`.

## Part D: Google sign-in only (owner request, 2026-10-17)

### Task 9: API auth

**Files:** `apps/api/src/auth/auth.ts`, `apps/api/src/app.module.ts`, delete `mailer.ts`, `mailer.spec.ts`, `test/support/fake-mailer.ts`; modify `test/support/session.ts`, `test/support/test-app.ts`, `test/auth.e2e-spec.ts`, `.env.example`, `docs/deploy.md`.

- [ ] `emailAndPassword.enabled` is true only in fake mode, with no email check. Production has Google only.
- [ ] Remove the mailer, the verification email and the reset email.
- [ ] Tests: `password sign-up is off outside fake mode`, `in fake mode, sign-up gives a session`.
- [ ] Check: each API e2e file, one at a time.

### Task 10: Web sign-in page

**Files:** `apps/web/src/components/auth/auth-form.tsx` (+ test), the sign-in and sign-up pages, delete the forgot-password and reset-password pages and `reset-form.tsx` (+ test), the account settings page, `apps/web/e2e/make-song.spec.ts`.

- [ ] Sign-in shows only "Continue with Google", with the Google mark, and the Terms line. `/sign-up` redirects to `/sign-in`.
- [ ] Use the `frontend-design` skill. Follow the Minstrel Mono canvas.
- [ ] Playwright signs up through the API in fake mode.

## Part E: Terms and Privacy

### Task 11: Free-tier service notice

**Files:** the `(legal)` pages.

- [ ] Say that the service runs on free tiers, can stop at any time, and can lose songs, keys and accounts with no way to get them back. Tell the user to download the songs they want to keep.
