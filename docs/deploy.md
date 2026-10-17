# Deploy Minstrel on Dokploy

Minstrel runs on the private server `root@main` (Ubuntu 24.04, public IP `175.100.20.52`) with
Dokploy. Cloudflare R2 holds the audio files and the database backups. All other parts run on the
server.

| Part | Dokploy resource | Notes |
|---|---|---|
| Web app (`apps/web`) | App `minstrel-web` | `apps/web/Dockerfile`, port 3000, path `/` |
| API (`apps/api`) | App `minstrel-api` | `apps/api/Dockerfile`, port 4000, path `/api`, no strip path |
| Database | Postgres 18 `minstrel-db` | Internal only, no public port |
| Daily sweep | Schedule on `minstrel-api` | `0 4 * * *`, time zone UTC |
| Backups | Backup of `minstrel-db` | R2 bucket `minstrel-backups`, daily, 14 kept |

Both apps use the domain `minstrel.alienstro.xyz`. Traefik sends `/api/*` to the API and all other
paths to the web app, so the browser reaches the API on the same origin.

## How a deploy works

1. A push to `main` starts `.github/workflows/deploy.yml`. You can also start it by hand with
   `gh workflow run deploy.yml`.
2. The workflow calls `POST /api/application.deploy` for `minstrel-api`, then for `minstrel-web`.
   It does not build or test anything, so each run uses about 1 minute of Actions time.
3. Dokploy pulls the branch that the app settings name, builds the image on the server, and
   replaces the container.
4. The API container runs `node dist/migrate.js` before the server starts. An advisory lock lets
   two containers start at the same time.

**Caution:** Keep "Autodeploy" OFF on both apps. If it is ON, each push starts two deploys.

Run the lint, the tests and the build on your computer before you push (`/do-tests full`).
GitHub runs no checks.

## GitHub secrets

| Secret | Value |
|---|---|
| `DOKPLOY_URL` | The HTTPS URL of the Dokploy panel, without `/api` |
| `DOKPLOY_API_KEY` | A key from Dokploy, Settings, Profile, API/CLI |
| `DOKPLOY_API_APP_ID` | The `applicationId` of `minstrel-api` |
| `DOKPLOY_WEB_APP_ID` | The `applicationId` of `minstrel-web` |

**Warning:** Give the Dokploy panel an HTTPS domain before you add the key. Do not send the key to
the plain HTTP port 3000.

## Environment of `minstrel-api`

Use the names in `apps/api/.env.example`. The Docker image sets `NODE_ENV=production` and
`PORT=4000`.

**Warning:** `KEY_ENCRYPTION_KEYS`, `BETTER_AUTH_SECRET` and `CRON_SECRET` must keep the values that
production used before. A different `KEY_ENCRYPTION_KEYS` makes all stored provider keys
unreadable. A different `BETTER_AUTH_SECRET` signs out all users.

- `WEB_ORIGIN=https://minstrel.alienstro.xyz`
- `DATABASE_URL` and `DATABASE_URL_UNPOOLED`: the internal URL of `minstrel-db`.
- Do not set `MINSTREL_FAKE_PROVIDERS`. The API does not start with it in production.

`minstrel-web` needs no environment variables.

## Daily sweep schedule

The schedule runs this command in the `minstrel-api` container:

```sh
node -e "fetch('http://localhost:4000/api/cron/sweep',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>{console.log(r.status);if(!r.ok)process.exit(1)})"
```

## DNS

Set `minstrel` to `A 175.100.20.52`. If Cloudflare holds the zone, use DNS-only (grey cloud).
With the proxy ON, the API sees a Cloudflare IP in `x-real-ip`, and all anonymous users share one
rate limit.

## Restore a backup

1. In Dokploy, open `minstrel-db`, Backups, and pick the backup file.
2. Restore it into a scratch database first, and compare the row counts of `user`, `generations`
   and `provider_connections`.
3. Stop `minstrel-api`, restore into `minstrel-db`, then start `minstrel-api`.

Test one restore after you set up the backups. A backup that you never restored is not a tested
backup.

## Failed deploy

- Dokploy keeps the old container when a build fails, so the site stays up.
- Turn on a Dokploy notification (email, Discord or Telegram) for build errors, because the
  workflow does not wait for the build result.
- To go back to an earlier version, revert the commit on `main` and push.
