# Minstrel launch checklist

Do these steps in order before the first public launch. The section numbers refer to the design spec,
`docs/superpowers/specs/2026-10-16-minstrel-v1-design.md`.

## 1. Vercel project

1. Import the repository as one Vercel project. The root `vercel.json` defines the `web` and `api`
   services, the `/api` rewrite, and the daily cron (§2.3).
2. Use the Hobby plan for the private beta. Hobby allows non-commercial use only. Move to Pro before
   Minstrel takes payments or shows ads.
3. Keep Fluid compute on. Do not set `maxDuration`. On Hobby, the default and the maximum are 300 s.
4. Put the functions in the same region as the database, for example `iad1`.
5. The `api` service runs `vercel-build`: `drizzle-kit migrate && nest build`. The migration uses
   `DATABASE_URL_UNPOOLED`.

## 2. Neon database

1. Add Neon from the Vercel Marketplace with Postgres 18, in the same region as the functions, for
   example `aws-us-east-1`.
2. Turn on the integration option that makes one Neon branch for each preview deployment. A preview
   migration then never touches production data.
3. Choose the Neon plan. The restore window depends on the plan, and the Free plan keeps only a short
   window.
4. Do one point-in-time restore test on a branch. Write the date and the result here.

## 3. Environment variables (§2.5)

Set each variable for Production and Preview. No secret uses the `NEXT_PUBLIC_` prefix.

| Name | Value |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | The Neon integration sets them. |
| `WEB_ORIGIN` | `https://minstrel.<name>.to` |
| `CRON_SECRET` | 32 or more random bytes |
| `BETTER_AUTH_SECRET` | 32 or more random bytes |
| `KEY_ENCRYPTION_KEYS` | `1:<base64 of 32 random bytes>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From the Google Cloud console |
| `RESEND_API_KEY`, `EMAIL_FROM` | From Resend, with a verified sending domain |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | From Cloudflare R2 |

> **Warning:** Do not set `MINSTREL_FAKE_PROVIDERS` on Vercel. It is for the local end-to-end test only.

Make a random secret with `openssl rand -base64 32`.

## 4. Cloudflare R2

1. Make a private bucket. Do not turn on public access. The browser gets audio through signed URLs only.
2. Make an API token with Object Read and Write on this bucket only.
3. Keep the default rule that aborts incomplete multipart uploads after 7 days.

## 5. Domain and sign-in

1. Add the domain in Vercel. Make the CNAME record in Cloudflare DNS with the proxy off (gray cloud).
   Vercel must issue the certificate and see the real client IP.
2. In the Google Cloud console, add the redirect URI `https://minstrel.<name>.to/api/auth/callback/google`.

## 6. Vercel Firewall

Add a rate-limit rule: 120 requests each minute for each IP on `/api/webhooks/*` (§7.4).

## 7. Checks at the first preview deploy (§2.3)

The Vercel docs do not state these items for services. Check each one and write the result here.

1. The top-level `crons` entry reaches the `api` service through the `/api/(.*)` rewrite. Run the cron
   from the Vercel dashboard, then find the `GET /api/cron/sweep` reply `200` in the `api` logs.
2. Both services build `packages/shared` from the pnpm workspace.

## 8. Checks before launch

1. **Client IP (§7.4).** From one network, sign in with a wrong password until Better Auth replies
   `429`. From a second network, sign in at once: it must work. This proves that the auth rate limit
   reads the real client IP from `x-real-ip`. Then send 11 songs in one minute from one account. The 11th
   reply must be `429 rate_limited`.
2. **Manual songs (§11).** On the production setup, make one real song with each adapter:
   - kie.ai: the song completes, and both takes play from R2.
   - A Suno-compatible service: the song completes, and both takes play from R2.
   - ElevenLabs: a 180 s song finishes in less than 240 s. Write the measured time here.
3. **Account deletion.** Delete a test account. Its objects under `users/<userId>/` in R2 must be gone.

## 9. Open decision for the owner

The direct-flow runner does not start the next queued ElevenLabs song at the end of a call, which is a
change from spec §5.4 step 2.8. A function stops at 300 s, and `waitUntil` work counts in that time, so a
second 240 s call in the same function call would stop and become `interrupted` after the user paid. A
read (the Studio page reads every 3 s) or the daily sweep starts the queued song in a new function call.
Confirm this change, then update the spec.
