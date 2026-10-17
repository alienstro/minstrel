# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM node:24-slim AS build
ENV TURBO_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@11.5.0
WORKDIR /repo
# pnpm fetch reads only the lockfile, so this layer stays cached until a dependency changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --offline --frozen-lockfile
RUN pnpm turbo run build --filter=@minstrel/api

# The bundles need no node_modules folder (scripts/bundle.mjs).
FROM node:24-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/api/dist/main.js /repo/apps/api/dist/main.js.map /repo/apps/api/dist/migrate.js /repo/apps/api/dist/migrate.js.map /repo/apps/api/dist/package.json ./dist/
COPY --from=build --chown=node:node /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 4000
# exec makes Node the main process, so it gets the SIGTERM of a deploy and shuts down cleanly.
CMD ["sh", "-c", "node dist/migrate.js && exec node --enable-source-maps dist/main.js"]
