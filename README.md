# Minstrel

Minstrel is a monorepo with a Next.js web app and a NestJS API.

## Structure

| Path              | Package          | Description                         |
| ----------------- | ---------------- | ----------------------------------- |
| `apps/web`        | `@minstrel/web`    | Next.js 16 app (App Router, Tailwind) on port 3000 |
| `apps/api`        | `@minstrel/api`    | NestJS 12 API on port 4000, prefix `/api` |
| `packages/shared` | `@minstrel/shared` | Types that the web app and the API share |

## Requirements

- Node.js 24 or later (see `.nvmrc`)
- pnpm 11 (run `corepack enable`)

## Commands

```bash
pnpm install       # Install all workspace dependencies
pnpm dev           # Start the web app and the API
pnpm build         # Build all packages
pnpm lint          # Lint all packages
pnpm typecheck     # Typecheck all packages
pnpm test          # Run all tests
```

Run one package with a filter, for example `pnpm --filter @minstrel/api dev`.

## Environment

Copy each `.env.example` file to `.env` in the same folder, then change the values.

## Health check

`GET http://localhost:4000/api/health` returns the API status.
