# Minstrel Mono UI and Resend Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline (single-agent mode on this machine). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make each web screen match the "Minstrel Mono" design canvas, send auth email through Resend, and keep the UI loading through a Neon cold start.

**Architecture:** The canvas artboards are the visual spec. Shared tokens and classes go in `globals.css`, shared parts go in `components/brand/`, and each route keeps its current data hooks. Only the markup and the styles change, so the existing behavior tests stay valid.

**Tech Stack:** Next.js 16.4 (read `node_modules/next/dist/docs/` before a Next API), Tailwind 4, `next/font/google`, React Query 5, NestJS, `resend`.

**Spec:** Canvas https://claude.ai/artifact/FeUxZspMaFVnnhML8H2uf4 (read each artboard with the Artifact tool, `path: project/<Name>.dc.html`), and `docs/superpowers/specs/2026-10-16-minstrel-v1-design.md` for behavior.

## Global Constraints

- Colors: page `#ffffff`, `--cream #eeeeee`, `--cream2 #e6e6e6`, `--cream3 #cdcdcd`, `--ink #111111`, `--mu #555555`, `--bd rgba(0,0,0,.2)`.
- Fonts: Geist 400/500/600 (body, 13px, line-height 1.5), Geist Mono (labels), Instrument Serif italic 400 (display titles).
- Controls: pill radius 999px, min-height 44px; the main action is `.dark` (ink, white, uppercase).
- Motion stops under `prefers-reduced-motion: reduce`. At ≤900px the photo columns hide.
- The operator is Robinx Prhynz Aquino. The only contact address is robinxaquino@gmail.com. No other company name appears.
- The 13 CC BY photos need the credit line in the Home footer (`docs/image-credits.md`).
- Tests: one file at a time, `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=1024`.

## Review Focus

- A Neon cold start makes the first API read slow or fail once: the page must keep its loading state, not show an error.
- A 4xx reply (wrong password, 404) must still show its error at once, with no retry.
- A phone-width screen (390px): no horizontal scroll, the forms stack.
- A user with reduced motion: no spinning disc, ring, or scrolling columns.
- Resend refuses an email (domain not verified): the sign-up must report a failure, not claim success.

---

### Task 1: Resend mailer

**Files:** Modify `apps/api/src/auth/mailer.ts`, `apps/api/src/auth/mailer.spec.ts`, `apps/api/src/app.module.ts`, `apps/api/package.json`, `apps/api/.env.example`, `docs/deploy.md`.

**Interfaces:** Produces `ResendMailer(client: ResendClient, from: string)` and `mailerFromEnv(env)`: Resend when `RESEND_API_KEY` is set, else SMTP (local development).

- [ ] Tests in `mailer.spec.ts`: `ResendMailer sends the reset link from EMAIL_FROM`, `ResendMailer throws when Resend returns an error`, `mailerFromEnv picks Resend when RESEND_API_KEY is set`, `mailerFromEnv picks SMTP without RESEND_API_KEY`.
- [ ] Watch them fail, implement, watch them pass.
- [ ] Browser: add the sending domain `alienstro.xyz` in Resend, add its DNS records in Cloudflare (proxy off), verify. The owner makes the API key.
- [ ] Add `RESEND_API_KEY` to the Vercel script prompts; set `EMAIL_FROM` to `Minstrel <noreply@alienstro.xyz>`.
- [ ] Check: `cd apps/api && pnpm exec jest src/auth/mailer.spec.ts --maxWorkers=1`

### Task 2: Cold-start loading

**Files:** Create `apps/web/src/lib/retry.ts`; modify `apps/web/src/app/providers.tsx`. Test: `apps/web/src/lib/retry.test.ts`.

**Interfaces:** Produces `shouldRetry(failureCount: number, error: unknown): boolean` and `retryDelay(attempt: number): number`.

- [ ] Tests: `retries a network error`, `retries a 502, 503, and 504 reply`, `does not retry a 4xx reply`, `stops after 6 tries`, `the delay grows and stops at 5000 ms`.
- [ ] Implement; queries use them, mutations keep `retry: 0`.
- [ ] Check: `pnpm exec vitest run src/lib/retry.test.ts --maxWorkers=1`

### Task 3: Brand foundation

**Files:** Modify `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`. Create `apps/web/src/components/brand/logo.tsx`, `apps/web/public/covers/c1.jpg`…`c15.jpg` (from the canvas uploads). Test: `apps/web/src/components/brand/logo.test.tsx`.

**Interfaces:** Produces the classes `.pill .dark .gl .in .card .mono .serif .mu .dotted .vh` and `<Logo size?: number tone?: 'ink' | 'white' />`.

- [ ] Test: `Logo is hidden from screen readers and draws the mark`.
- [ ] Replace the laser theme with the canvas tokens; load the 3 fonts with `next/font/google`.
- [ ] Check: `pnpm run typecheck`

### Task 4: Auth screens

**Files:** Create `apps/web/src/components/brand/auth-stage.tsx` (columns, cover ring, record sleeve). Modify `app/(auth)/layout.tsx`, `components/auth/auth-form.tsx`, `components/auth/reset-form.tsx`, the 4 auth pages. Artboards: `SignIn`, `SignUp`, `ForgotPassword` (reset password reuses ForgotPassword).

- [ ] Keep `auth-form.test.tsx` and `reset-form.test.tsx` green; update only the labels that the artboards change.
- [ ] Check: `pnpm exec vitest run src/components/auth --maxWorkers=1`

### Task 5: Home, legal, and contact

**Files:** Modify `app/page.tsx`, `app/(legal)/layout.tsx`, `components/legal/*`. Create `app/(legal)/contact/page.tsx`. Artboards: `Home`, `Privacy`, `Terms`, `Contact`.

- [ ] Keep the facts of the current privacy and terms text; take the layout from the artboards.
- [ ] Add test `Home footer credits the photos` in `components/legal/legal.test.tsx` or a new home test.
- [ ] Check: `pnpm exec vitest run src/components/legal --maxWorkers=1`

### Task 6: App shell and Studio

**Files:** Modify `app/(app)/layout.tsx`, `components/nav.tsx`, `components/player/player-bar.tsx`, `components/studio/*`. Artboards: `Main` (desktop), `StudioPhone` (390px).

- [ ] Keep the studio tests green.
- [ ] Check: `pnpm exec vitest run src/components/studio --maxWorkers=1`

### Task 7: Library

**Files:** Modify `app/(app)/library/page.tsx`, `components/library/track-list.tsx`. Artboard: `Library`.

- [ ] Check: `pnpm exec vitest run src/components/library --maxWorkers=1`

### Task 8: Settings

**Files:** Modify `app/(app)/settings/*`, `components/settings-tabs.tsx`, `components/connections/*`, `components/account/*`. Artboards: `Connections`, `Account`.

- [ ] Check: `pnpm exec vitest run src/components/connections src/components/account --maxWorkers=1`

### Task 9: Gate, screenshots, and deploy

- [ ] Full gate: lint, typecheck, test, build, one at a time.
- [ ] Screenshot each route at 1280px and 390px; compare with its artboard.
- [ ] Commit per task; push; deploy Production after the owner sets the Vercel variables.
