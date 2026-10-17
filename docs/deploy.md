# Deploy Minstrel on Dokploy

Minstrel runs on the private server `root@main` (Ubuntu 24.04) with Dokploy. Cloudflare R2 holds
the audio files and the database backups. All other parts run on the server.

The server is behind a router (NAT), so the internet cannot open a connection to it. A Cloudflare
Tunnel makes an outgoing connection from the server to Cloudflare, and Cloudflare sends the
traffic back through it. The Dokploy panel stays on Tailscale (`http://100.105.205.7:3000`).

| Part | Dokploy resource | Notes |
|---|---|---|
| Web app (`apps/web`) | App `minstrel-web` | `apps/web/Dockerfile`, port 3000, path `/` |
| API (`apps/api`) | App `minstrel-api` | `apps/api/Dockerfile`, port 4000, path `/api`, no strip path |
| Database | Postgres 18 `minstrel-db` | Internal only, no public port |
| Daily sweep | Schedule on `minstrel-api` | `0 4 * * *`, time zone UTC |
| Backups | Backup of `minstrel-db` | R2 bucket `minstrel-backups`, daily, 14 kept |
| Tunnel | App `cloudflared` | Image `cloudflare/cloudflared`, command `tunnel run`, env `TUNNEL_TOKEN` |

**Warning:** The server is an LXC container on Proxmox. Docker Swarm virtual IPs need the kernel IPVS
load balancer, which does not work inside LXC, so Traefik gets "connection refused". Set
**Endpoint Spec Mode** to `dnsrr` (Advanced, Swarm settings) on each new Dokploy app before its
first deploy.

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

## Cloudflare Tunnel

Make the tunnel in the Cloudflare dashboard (Zero Trust, Networks, Tunnels, type Cloudflared). Put
its token in the `cloudflared` app as `TUNNEL_TOKEN`, and attach the app to `dokploy-network`.

| Public hostname | Path | Service |
|---|---|---|
| `minstrel.alienstro.xyz` | (all) | `http://dokploy-traefik:80` |
| `deploy.alienstro.xyz` | `^/api/application\.deploy$` | `http://dokploy:3000` |

- The Dokploy domains of `minstrel-web` and `minstrel-api` use HTTPS OFF. Cloudflare holds the
  certificate, and the tunnel carries plain HTTP inside the server.
- `deploy.alienstro.xyz` lets GitHub reach only the deploy call of Dokploy. All other panel paths
  get `404`, so the panel login is not on the internet.
- The API reads the user IP from the `cf-connecting-ip` header. Traefik sets `x-real-ip` to the
  tunnel container, so that header is not the user IP.

- A request without `cf-connecting-ip` falls back to `x-real-ip`, so it still has its own rate
  limit.

**Caution:** Do not open ports 80, 443 or 3000 on the router. Then a request could skip Cloudflare
and set a false `cf-connecting-ip`. A device on the home network or on Tailscale can already do
this, so it can avoid the anonymous rate limits. This is an accepted risk, because you control
those devices.

## GitHub secrets

| Secret | Value |
|---|---|
| `DOKPLOY_URL` | `https://deploy.alienstro.xyz` |
| `DOKPLOY_API_KEY` | A key from Dokploy, Settings, Profile, API/CLI |
| `DOKPLOY_API_APP_ID` | The `applicationId` of `minstrel-api` |
| `DOKPLOY_WEB_APP_ID` | The `applicationId` of `minstrel-web` |

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

The tunnel makes a proxied `CNAME` for each public hostname. Before you add
`minstrel.alienstro.xyz` to the tunnel, delete the old `minstrel` CNAME that points to Vercel.

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

## Cloudflare R2

1. Make a private bucket. Do not turn on public access. The browser gets audio through signed URLs only.
2. Make an API token with Object Read and Write on this bucket only.
3. Keep the default rule that aborts incomplete multipart uploads after 7 days.
4. Make a second private bucket `minstrel-backups` for the database backups, with its own token.

## Google sign-in

In the Google Cloud console, the redirect URI is
`https://minstrel.alienstro.xyz/api/auth/callback/google`. The domain does not change on Dokploy,
so this value stays the same.

## Webhook rate limit (open item)

On Vercel, a Firewall rule allowed 120 requests each minute for each IP on `/api/webhooks/*`
(spec §7.4). Add a Cloudflare rate limiting rule for that path in place of it. The Free plan
allows one rule with a 10-second period, so use 20 requests each 10 seconds for each IP.

## Checks before launch

1. **Client IP (§7.4).** From one network, send `POST /api/auth/sign-in/social` until Better Auth
   replies `429`. From a second network, sign in with Google at once: it must work. This proves that
   the auth rate limit reads the real client IP from the `cf-connecting-ip` header that Cloudflare
   sets. Then
   send 11 songs in one minute from one account. The 11th reply must be `429 rate_limited`.
2. **Manual songs (§11).** On the production setup, make one real song with kie.ai. The song
   completes, and both takes play from R2.
3. **Account deletion.** Delete a test account. Its objects under `users/<userId>/` in R2 must be gone.

## Rotate the key encryption key (§7.1)

Do these steps in this order. A Dokploy environment change applies only after a new deploy.

1. Make a new key with `openssl rand -base64 32`.
2. In `minstrel-api`, set `KEY_ENCRYPTION_KEYS` to `1:<old key>,2:<new key>`. Keep the old key in
   the list.
3. Deploy `minstrel-api`. Wait until the new container serves the traffic. From now on, the API
   seals each new key with version 2.

   > **Caution:** Do not do step 4 before step 3 is complete. The old container still seals keys
   > with version 1, and the script does not see a key that the old container writes after the
   > script reads the rows.

4. Give `minstrel-db` a temporary external port in Dokploy, and reach it through an SSH tunnel:
   `ssh -L 5434:localhost:<external port> root@main`. In `apps/api`, run
   `DATABASE_URL_UNPOOLED=postgres://<user>:<password>@localhost:5434/<db> KEY_ENCRYPTION_KEYS='1:<old key>,2:<new key>' pnpm keys:rotate`.
   It prints `Rotated <n> provider keys to version 2.`
5. Run the same command again. It must print `Rotated 0 provider keys to version 2.` The script
   skips a key that a user replaces while it runs, so the second run moves any key that the first
   run skipped.
6. Run `SELECT key_version, count(*) FROM provider_connections GROUP BY 1;`. Each row must show
   version 2. Then remove the external port.

   > **Warning:** Do not remove the old key before step 6 shows only version 2. A key with version 1
   > then cannot be decrypted, and its user must add the key again.

7. Set `KEY_ENCRYPTION_KEYS` to `2:<new key>`, then deploy `minstrel-api`.
