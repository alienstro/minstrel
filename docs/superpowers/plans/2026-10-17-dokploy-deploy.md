# Dokploy Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the web app, the API, the daily cron and Postgres from the Vercel and Neon free tiers to Dokploy on `root@main`. Keep Cloudflare R2.

**Architecture:** Dokploy runs two apps (`minstrel-web`, `minstrel-api`) and one Postgres 18 database on the server. Traefik sends `minstrel.alienstro.xyz/api/*` to the API and all other paths to the web app, so the origin stays the same. Dokploy builds the images on the server. A GitHub Actions workflow only tells Dokploy to deploy (CD), and runs no lint, test or build (no CI).

**Tech Stack:** Dokploy v0.30.6 (Docker Swarm, Traefik v3.6.7), Node 24, pnpm 11.5.0, Turborepo `turbo prune --docker`, Next.js 16 standalone output, NestJS, drizzle-orm migrator, Postgres 18.

**Spec:** this file. The decisions come from the chat of 2026-10-17.

## Global Constraints

- Server: Ubuntu 24.04, 4 CPU, 12 GB RAM, behind NAT (outgoing IP `143.44.145.74`, no open ports). `9router` also runs there. Do not change it.
- Inbound traffic comes only through a Cloudflare Tunnel (decided 2026-10-17). The Dokploy panel stays on Tailscale; only `^/api/application\.deploy$` is public, on `deploy.alienstro.xyz`.
- Domain stays `minstrel.alienstro.xyz`. So Google OAuth redirect URIs and kie.ai callback URLs (`WEB_ORIGIN`) do not change.
- R2 stays the file store. R2 also holds the database backups, in a separate bucket `minstrel-backups`.
- GitHub Actions does CD only. No lint, test, typecheck or image build runs on GitHub.
- Dokploy "Autodeploy" stays OFF on both apps, so only the workflow starts a deploy.
- `KEY_ENCRYPTION_KEYS`, `BETTER_AUTH_SECRET` and `CRON_SECRET` must have the same values as on Vercel. A different `KEY_ENCRYPTION_KEYS` makes all stored provider keys unreadable.
- Do not merge this branch to `main` before the cutover (Task 7). Vercel still deploys `main`, and Task 1 removes `waitUntil`.
- Prerequisite: merge PR #4 first, then branch `feat/dokploy-deploy` from `main`.

## Review Focus

1. A deploy stops the old API container while a background task runs. The task must finish, or stop after 10 s, before the process exits (Task 1).
2. Two API containers start at the same time during a rolling deploy and both run migrations. The drizzle migrator must stay safe when it runs twice (Task 2).
3. `MINSTREL_FAKE_PROVIDERS=1` with `NODE_ENV=production` must stop the API (Task 3).
4. Behind the tunnel, `x-real-ip` is the tunnel container, so all anonymous users would share one rate limit. The API reads `cf-connecting-ip` (Task 5b).
5. A kie.ai callback that arrives at Vercel after the database dump writes to Neon, and the new database misses it. Do the cutover when no generation is in progress (Task 7).

---

### Task 1: Background work and shutdown for a long-running Node server

**Goal:** Replace `waitUntil` from `@vercel/functions` with a Node implementation that tracks running tasks and waits for them on shutdown.

**Files:**
- Modify: `apps/api/src/common/background-work.ts` — rename `VercelBackgroundWork` to `NodeBackgroundWork`; add `onApplicationShutdown(): Promise<void>` that waits for all pending tasks, max 10 000 ms.
- Modify: `apps/api/src/common/background-work.spec.ts`
- Modify: `apps/api/src/db/db.module.ts` — remove `attachDatabasePool`.
- Modify: `apps/api/src/main.ts` — call `app.enableShutdownHooks()`; update the Vercel comment.

**Tests:** `runs the task after run() returns`, `logs a failed task and does not throw`, `onApplicationShutdown waits for a pending task`, `onApplicationShutdown stops waiting after the timeout`.

- [ ] Write the failing tests, run them, implement, run them again, commit.

**Check:** `cd apps/api && NODE_OPTIONS=--max-old-space-size=1024 pnpm vitest run src/common/background-work.spec.ts --maxWorkers=1`

### Task 2: Migration runner in the image

**Goal:** Run the drizzle migrations from a bundled `dist/migrate.js` before the API starts. `drizzle-kit` is not in the runtime image.

**Files:**
- Create: `apps/api/src/db/migrate.ts` — `runMigrations(url: string, migrationsFolder: string): Promise<void>` with `migrate()` from `drizzle-orm/node-postgres/migrator`; a CLI part reads `DATABASE_URL_UNPOOLED ?? DATABASE_URL`.
- Create: `apps/api/src/db/migrate.spec.ts` — uses `TEST_DATABASE_URL`.
- Modify: `apps/api/scripts/bundle-for-vercel.mjs` — rename to `bundle.mjs`; add `dist/db/migrate.js` as a second entry point, output `dist/migrate.js`.
- Modify: `apps/api/package.json` — `build` script uses `bundle.mjs`.

**Tests:** `applies all migrations to an empty schema`, `is safe to run twice`.

- [ ] Write the failing tests, run them, implement, run them again, commit.

**Check:** `cd apps/api && NODE_OPTIONS=--max-old-space-size=1024 pnpm vitest run src/db/migrate.spec.ts --maxWorkers=1`

### Task 3: Production guard without Vercel

**Goal:** `isFakeMode()` refuses the fake provider when `NODE_ENV === 'production'`, in place of `VERCEL_ENV`.

**Files:**
- Modify: `apps/api/src/common/fake-mode.ts`
- Modify: `apps/api/src/common/fake-mode.spec.ts`
- Modify: `apps/api/.env.example` — replace the Vercel and Neon notes with Dokploy notes; add `NODE_ENV`.

**Tests:** `throws when the flag is set and NODE_ENV is production`, `returns true when the flag is set and NODE_ENV is not production`.

- [ ] Write the failing tests, run them, implement, run them again, commit.

**Check:** `cd apps/api && NODE_OPTIONS=--max-old-space-size=1024 pnpm vitest run src/common/fake-mode.spec.ts --maxWorkers=1`

### Task 4: Dockerfiles

**Goal:** Two small images from the monorepo with `turbo prune <pkg> --docker`.

**Files:**
- Create: `apps/api/Dockerfile` — stages `prune`, `build`, `run` (`node:24-slim`). The run stage copies only `dist/main.js`, `dist/migrate.js`, `dist/package.json` and `drizzle/`. `CMD` runs `node dist/migrate.js && node dist/main.js`. `ENV NODE_ENV=production PORT=4000`. Runs as user `node`.
- Create: `apps/web/Dockerfile` — same stages; the run stage copies `.next/standalone`, `.next/static` and `public`. `CMD ["node", "apps/web/server.js"]`, port 3000.
- Create: `.dockerignore` — `node_modules`, `.next`, `dist`, `.env*`, `.vercel`, `.turbo`, `.git`.
- Modify: `apps/web/next.config.ts` — `output: "standalone"` and `outputFileTracingRoot` set to the repository root.

**Tests:** none (build config). The check builds each image. Build one image at a time.

- [ ] Write the files, build the API image, build the web image, run the API image against the local Docker Postgres and get `200` from `/api/health` or the nearest public route, commit.

**Check:** `docker build -f apps/api/Dockerfile -t minstrel-api . && docker build -f apps/web/Dockerfile -t minstrel-web .`

### Task 5: CD workflow

**Goal:** On a push to `main` (and on a manual run), GitHub tells Dokploy to deploy the API, then the web app. The job only calls the Dokploy API, so each run uses about 1 minute of Actions time.

**Files:**
- Create: `.github/workflows/deploy.yml` — `on: push: branches: [main]` and `workflow_dispatch`; `concurrency: deploy-production`; one job with `curl --fail` to `POST $DOKPLOY_URL/api/application.deploy` with header `x-api-key`, for `DOKPLOY_API_APP_ID` and then `DOKPLOY_WEB_APP_ID`.
- Create: `docs/deploy.md` — the runbook: Dokploy setup, env vars, secrets, backup restore, and how to go back to Vercel.

**Repository secrets:** `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `DOKPLOY_API_APP_ID`, `DOKPLOY_WEB_APP_ID`.

**Tests:** none. Verify the endpoint name against the Dokploy v0.30 API docs before you write the file.

- [ ] Write the files, run the workflow by hand on the branch after Task 6, commit.

**Check:** `gh workflow run deploy.yml --ref feat/dokploy-deploy && gh run watch`

### Task 5b: Client IP from Cloudflare

**Goal:** Better Auth and the rate limit read the user IP from `cf-connecting-ip`.

**Files:** Create `apps/api/src/common/client-ip.ts` (`CLIENT_IP_HEADER`); modify `apps/api/src/auth/auth.ts`, `apps/api/src/common/pg-throttler.storage.ts`; tests in `test/throttle.e2e-spec.ts`, `test/auth.e2e-spec.ts`.

**Tests:** `each Cloudflare client IP gets its own count`, `Better Auth records the cf-connecting-ip address, not the tunnel address`.

**Check:** `cd apps/api && NODE_OPTIONS=--max-old-space-size=1024 pnpm vitest run --config ./vitest.config.e2e.ts test/throttle.e2e-spec.ts --maxWorkers=1`

### Task 6: Dokploy setup (server, no code)

**Goal:** Make the Dokploy resources. Ask the user before each change on the server.

- [ ] Make the Cloudflare Tunnel, and the Dokploy app `cloudflared` on `dokploy-network`. Public hostname `deploy.alienstro.xyz`, path `^/api/application\.deploy$`, to `http://dokploy:3000`.
- [ ] Connect the GitHub App to Dokploy for the private repository `alienstro/minstrel`.
- [ ] Make project `minstrel` with Postgres 18 database `minstrel-db` (internal only, no public port).
- [ ] Add an R2 S3 destination and a daily backup of `minstrel-db` to bucket `minstrel-backups`, 14 days kept. Test one restore into a scratch database.
- [ ] Make app `minstrel-api` (Dockerfile `apps/api/Dockerfile`, context `.`), env from `apps/api/.env.example` with the Vercel values, `DATABASE_URL` and `DATABASE_URL_UNPOOLED` set to the internal URL. Domain `minstrel.alienstro.xyz`, path `/api`, no strip path, port 4000, HTTPS OFF (Cloudflare holds the certificate).
- [ ] Make app `minstrel-web` (Dockerfile `apps/web/Dockerfile`). Domain `minstrel.alienstro.xyz`, path `/`, port 3000, HTTPS OFF. Autodeploy OFF on both apps.
- [ ] Add a schedule on `minstrel-api`: cron `0 4 * * *`, time zone UTC, command `node -e` that calls `fetch("http://localhost:4000/api/cron/sweep")` with `Authorization: Bearer $CRON_SECRET` and exits 1 when the status is not 2xx.
- [ ] Create the Dokploy API key and the four GitHub secrets.

**Check:** `ssh root@main 'docker service ls'` shows `minstrel-api`, `minstrel-web` and `minstrel-db` at `1/1`.

### Task 7: Cutover

**Goal:** Copy the Neon data, then move DNS to the server.

**Caution:** do this when no generation is in progress. Keep the Vercel project and the Neon database until Task 8.

- [ ] Stop the `minstrel-api` app in Dokploy, so its startup migration does not race the restore.
- [ ] Dump Neon with `pg_dump -Fc --no-owner --no-acl` from the `postgres:18` image, on the server, with `DATABASE_URL_UNPOOLED`.
- [ ] Restore into `minstrel-db` with `pg_restore --no-owner --no-acl`. Compare the row counts of `user`, `generations` and `provider_connections` with Neon.
- [ ] Start `minstrel-api`. Test on the server with `curl -H 'Host: minstrel.alienstro.xyz' http://localhost/api/health` before you change DNS.
- [ ] Delete the `minstrel` CNAME to Vercel, then add the public hostname `minstrel.alienstro.xyz` to `http://dokploy-traefik:80` in the tunnel.
- [ ] Smoke test: Google sign-in, one song generation with its kie.ai callback, play a file from R2, run the sweep schedule by hand.
- [ ] Disconnect the Git integration in the Vercel project, then merge the branch. The CD workflow deploys `main`.

**Check:** `curl -sI https://minstrel.alienstro.xyz/ | grep -i '^server'` shows `cloudflare`, and the Dokploy logs of `minstrel-web` show the request.

### Task 8: Remove Vercel (a few days after Task 7)

**Goal:** Remove the Vercel-only code and config.

**Files:**
- Delete: `vercel.json`, `apps/api/scripts/migrate-on-vercel.mjs`.
- Modify: `apps/api/package.json` — remove `@vercel/functions` and the `migrate-on-vercel` step.
- Modify: `package.json` — remove `dev:vercel`.

- [ ] Make the changes, build, commit. Then delete the Vercel project and the Neon project (keep one final Neon dump in `minstrel-backups`).

**Check:** `pnpm run build -- --concurrency=1`

### Task 9: Update the Vercel comments

**Goal:** The comments name Traefik and Dokploy, not Vercel.

**Files:**
- Modify: `apps/api/src/generations/sweep.controller.ts`, `apps/api/src/common/pg-throttler.storage.ts`, `apps/web/next.config.ts`.

- [ ] Change the comments, run the full gate one time (`/do-tests full`), commit.

**Check:** `rg -i vercel apps package.json` returns no hits.
